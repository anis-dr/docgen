#! /usr/bin/env node
import { Command } from 'commander';
import { packageJSON } from 'utils/packageJson.js';
import { renderTitle } from 'utils/renderTitle.js';

(async () => {
	renderTitle();

	const program = new Command();

	program
		.name('docgen')
		.description('🔥 Generate documentation for your project.')
		.version(
			packageJSON.version,
			'-v, --version',
			'display the version number',
		);
})();
