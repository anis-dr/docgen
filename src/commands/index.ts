import { err, ok, Result } from 'neverthrow';
import fs from 'node:fs';
import ora from 'ora';
import path from 'path';
import ts from 'typescript';
import { astSplitFile, Chunk } from '../ast-splitter';

// --- Branded Errors ---
export class ConfigNotFoundError extends Error {
	readonly _tag = 'ConfigNotFoundError';
	constructor(msg: string) {
		super(msg);
	}
}
export class ConfigParseError extends Error {
	readonly _tag = 'ConfigParseError';
	constructor(msg: string) {
		super(msg);
	}
}
export class ASTAnalysisError extends Error {
	readonly _tag = 'ASTAnalysisError';
	constructor(msg: string) {
		super(msg);
	}
}

interface IndexOptions {
	force?: boolean;
	deep?: boolean;
}

// --- AST Analysis Group ---

function createTsSystem() {
	return {
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
	};
}

function analyzeProjectAST(
	projectPath: string,
	options: IndexOptions = {},
): Result<
	{ chunks: Chunk[]; program: ts.Program; configPath: string },
	ConfigNotFoundError | ConfigParseError | ASTAnalysisError
> {
	const { deep = false } = options;
	const resolvedPath = path.resolve(process.cwd(), projectPath);
	const system = createTsSystem();

	const configPath = ts.findConfigFile(
		resolvedPath,
		system.fileExists,
		'tsconfig.json',
	);
	if (!configPath) {
		return err(new ConfigNotFoundError('Could not find tsconfig.json'));
	}

	const configFile = ts.readConfigFile(configPath, system.readFile);
	if (configFile.error) {
		return err(
			new ConfigParseError(
				`Failed to read tsconfig.json: ${configFile.error.messageText}`,
			),
		);
	}

	const parsedConfig = ts.parseJsonConfigFileContent(
		configFile.config,
		system,
		path.dirname(configPath),
	);
	if (parsedConfig.errors.length > 0) {
		return err(
			new ConfigParseError(
				`Failed to parse tsconfig.json: ${parsedConfig.errors[0].messageText}`,
			),
		);
	}

	try {
		const program = ts.createProgram(
			parsedConfig.fileNames,
			parsedConfig.options,
		);
		const chunks: Chunk[] = [];
		for (const sourceFile of program.getSourceFiles()) {
			if (
				!sourceFile.isDeclarationFile &&
				sourceFile.fileName.includes('/src/')
			) {
				const result = astSplitFile(program, sourceFile.fileName, { deep });
				if (result.isOk()) {
					chunks.push(...result.value);
				}
			}
		}
		return ok({ chunks, program, configPath });
	} catch (e) {
		return err(
			new ASTAnalysisError(
				e instanceof Error ? e.message : 'Unknown AST analysis error',
			),
		);
	}
}

// --- CLI Command ---

export const indexCommand = (
	projectPath: string,
	options: IndexOptions = {},
): Result<
	Chunk[],
	ConfigNotFoundError | ConfigParseError | ASTAnalysisError
> => {
	const spinner = ora('Setting up project...').start();
	try {
		spinner.text = 'Analyzing project AST...';
		const astResult = analyzeProjectAST(projectPath, options);
		if (astResult.isErr()) {
			spinner.fail(astResult.error.message);
			return err(astResult.error);
		}
		const { chunks, program } = astResult.value;
		if (chunks.length === 0) {
			spinner.warn(
				'No code chunks found. Make sure you have TypeScript files in your src directory.',
			);
		} else {
			spinner.succeed(
				`Found ${chunks.length} code chunks${
					options.deep ? ' (deep mode)' : ''
				} across ${program.getSourceFiles().length} files`,
			);
		}
		return ok(chunks);
	} catch (error) {
		spinner.fail('Failed to analyze project');
		return err(
			new ASTAnalysisError(
				error instanceof Error ? error.message : 'Unknown error',
			),
		);
	}
};
