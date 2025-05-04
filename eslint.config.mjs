import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all,
});

export default defineConfig([
	globalIgnores([
		'**/build/',
		'**/dist/',
		'**/node_modules/',
		'eslint.config.mjs',
	]),
	{
		extends: compat.extends(
			'eslint:recommended',
			'plugin:prettier/recommended',
		),

		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},

			ecmaVersion: 2015,
			sourceType: 'module',
		},
	},
	{
		files: ['**/*.ts'],
		extends: compat.extends('plugin:@typescript-eslint/recommended'),

		plugins: {
			'@typescript-eslint': typescriptEslint,
		},

		languageOptions: {
			parser: tsParser,
		},

		rules: {
			'@typescript-eslint/ban-ts-comment': 'warn',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
		},
	},
]);
