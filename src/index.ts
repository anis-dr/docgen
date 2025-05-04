#! /usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import { packageJSON } from 'utils/packageJson.js';
import { renderTitle } from 'utils/renderTitle.js';
import { generateCommand } from './commands/generate.js';
import { indexCommand } from './commands/index.js';

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
		.command('index')
		.description('Build or update the documentation index')
		.action(indexCommand);

	program
		.command('generate')
		.description('Generate documentation')
		.action(generateCommand);

	await program.parseAsync(process.argv);
})();
