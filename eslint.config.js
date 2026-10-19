import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import { loadConfig } from '@sveltejs/load-config';

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config;

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

// Explicit projects instead of projectService: with projectService every parsed
// .svelte file invalidates the shared program and lint takes minutes, not seconds
const typed = {
	project: ['./tsconfig.json', './scripts/tsconfig.json', './src/service-worker/tsconfig.json'],
	tsconfigRootDir: import.meta.dirname
};

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-undef': 'off',
			// A leading underscore marks a binding that is unused on purpose
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
			]
		}
	},
	{
		// Imports go through #lib/..., the generated shadcn components keep their own style
		files: ['**/*.ts', '**/*.svelte'],
		ignores: ['src/lib/components/ui/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['./*', '../*', '!./$types', '!../app.css'],
							message: 'Import through #lib/... instead of a relative path.'
						}
					]
				}
			]
		}
	},
	{
		// A route test imports the route next to it, which has no #lib alias
		files: ['src/routes/**/*.test.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['../*'], message: 'Import through #lib/... instead of a relative path.' }
					]
				}
			]
		}
	},
	{
		// Scripts share helpers with each other, but reach the app through #lib/...
		files: ['scripts/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['../*'], message: 'Import through #lib/... instead of a relative path.' }
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				...typed,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// Type-aware rules: every promise is awaited, voided or caught
		files: ['**/*.ts', '**/*.svelte'],
		languageOptions: {
			parserOptions: typed
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			// Svelte event attributes accept async handlers
			'@typescript-eslint/no-misused-promises': [
				'error',
				{ checksVoidReturn: { attributes: false } }
			],
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/switch-exhaustiveness-check': [
				'error',
				{ considerDefaultExhaustiveForUnions: true }
			]
		}
	}
);
