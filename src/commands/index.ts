import { err, ok, Result } from 'neverthrow';
import fs from 'node:fs';
import ora from 'ora';
import path from 'path';
import ts from 'typescript';
import { astSplitFile, Chunk } from '../ast-splitter';

// Create a custom TypeScript system
const createTsSystem = () => ({
	...ts.sys,
	fileExists: fs.existsSync,
	readFile: (path: string) => {
		try {
			return fs.readFileSync(path, 'utf-8');
		} catch {
			return undefined;
		}
	},
	readDirectory: ts.sys?.readDirectory ?? (() => []),
	getCurrentDirectory: () => process.cwd(),
});

interface IndexOptions {
	force?: boolean;
	deep?: boolean;
}

export const indexCommand = (
	projectPath: string,
	options: IndexOptions = {},
): Result<Chunk[], Error> => {
	const spinner = ora('Setting up project...').start();
	const { deep = false } = options;

	try {
		// Resolve the project path
		const resolvedPath = path.resolve(process.cwd(), projectPath);
		const system = createTsSystem();

		// Look for tsconfig.json
		const configPath = ts.findConfigFile(
			resolvedPath,
			system.fileExists,
			'tsconfig.json',
		);

		if (!configPath) {
			spinner.fail('Could not find tsconfig.json');
			return err(new Error('Could not find tsconfig.json'));
		}

		// Parse the config
		const configFile = ts.readConfigFile(configPath, system.readFile);
		if (configFile.error) {
			return err(
				new Error(
					`Failed to read tsconfig.json: ${configFile.error.messageText}`,
				),
			);
		}

		// Parse the config content
		const parsedConfig = ts.parseJsonConfigFileContent(
			configFile.config,
			system,
			path.dirname(configPath),
		);

		if (parsedConfig.errors.length > 0) {
			return err(
				new Error(
					`Failed to parse tsconfig.json: ${parsedConfig.errors[0].messageText}`,
				),
			);
		}

		spinner.text = 'Creating TypeScript program...';

		// Create program with parsed config
		const program = ts.createProgram(
			parsedConfig.fileNames,
			parsedConfig.options,
		);

		spinner.text = 'Analyzing files...';

		// Process each source file
		const chunks: Chunk[] = [];
		for (const sourceFile of program.getSourceFiles()) {
			// Skip declaration files and files outside src
			if (
				!sourceFile.isDeclarationFile &&
				sourceFile.fileName.includes('/src/')
			) {
				spinner.text = `Analyzing ${path.relative(
					resolvedPath,
					sourceFile.fileName,
				)}...`;
				const result = astSplitFile(program, sourceFile.fileName, { deep });
				if (result.isOk()) {
					chunks.push(...result.value);
				} else {
					spinner.warn(
						`Failed to analyze ${sourceFile.fileName}: ${result.error.message}`,
					);
				}
			}
		}

		if (chunks.length === 0) {
			spinner.warn(
				'No code chunks found. Make sure you have TypeScript files in your src directory.',
			);
		} else {
			spinner.succeed(
				`Found ${chunks.length} code chunks${
					deep ? ' (deep mode)' : ''
				} across ${program.getSourceFiles().length} files`,
			);
		}
		return ok(chunks);
	} catch (error) {
		spinner.fail('Failed to analyze project');
		return err(error instanceof Error ? error : new Error('Unknown error'));
	}
};
