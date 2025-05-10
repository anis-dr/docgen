#! /usr/bin/env node
import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { packageJSON } from 'utils/packageJson.js';
import { renderTitle } from 'utils/renderTitle.js';
import { generateCommand } from './commands/generate.js';
import {
	ASTAnalysisError,
	ConfigNotFoundError,
	ConfigParseError,
	indexCommand,
} from './commands/index.js';
import { logger } from './utils/logger.js';

(async () => {
	renderTitle();

	const program = new Command();

	program
		.name('docgen')
		.description(chalk.cyan('🔥 Generate documentation for your project.'))
		.version(packageJSON.version, '-v, --version', 'display the version number')
		.option('-c, --config <path>', 'specify config file')
		.option('--verbose', 'enable verbose output');

	program
		.command('index [project-path]')
		.description('Build or update the documentation index')
		.option('-f, --force', 'force the index to be rebuilt')
		.option(
			'-d, --deep',
			'perform deep analysis including function bodies and local variables',
		)
		.action((projectPath, cmdOptions) => {
			// Default project path to current directory if not provided
			const path = projectPath || '.';

			const result = indexCommand(path, {
				deep: cmdOptions.deep,
				force: cmdOptions.force,
			});

			if (result.isErr()) {
				const err = result.error;
				if (err instanceof ConfigNotFoundError) {
					logger.error('Config not found: ' + err.message);
				} else if (err instanceof ConfigParseError) {
					logger.error('Config parse error: ' + err.message);
				} else if (err instanceof ASTAnalysisError) {
					logger.error('AST analysis error: ' + err.message);
				} else {
					logger.error('Unknown error: ' + String(err));
				}
			}

			logger.info('result', JSON.stringify(result.unwrapOr(null), null, 2));
		});

	program
		.command('generate')
		.description('Generate documentation')
		.action(generateCommand);

	await program.parseAsync(process.argv);
})();
