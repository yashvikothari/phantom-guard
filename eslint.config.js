// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Node built-ins and platform APIs that must never appear in the pure analysis engine. */
const ENGINE_FORBIDDEN_GLOBALS = [
  'Date',
  'process',
  'require',
  'window',
  'document',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'setTimeout',
  'setInterval',
  'console',
].map((name) => ({
  name,
  message: 'core-engine is pure: no clocks, I/O, DOM or Node APIs (see .kiro/steering/tech.md).',
}));

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.scratch/**', '.netlify/**'],
  },

  js.configs.recommended,

  // TypeScript: type-aware rules for every package.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
        {
          selector: 'TSEnumDeclaration',
          message: 'Use a string-literal union instead of an enum.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Never render user text as HTML.',
        },
      ],
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
  },

  // The engine is a pure library: enforce what tech.md and Requirements 9.6 and 12.1 promise.
  {
    files: ['packages/core-engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...ENGINE_FORBIDDEN_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The engine must be deterministic.' },
        { object: 'Date', property: 'now', message: 'The engine must not read the clock.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'path',
                'os',
                'child_process',
                'http',
                'https',
                'net',
                'crypto',
              ],
              message: 'core-engine must run in a browser: no Node built-ins.',
            },
            {
              group: ['@phantomguard/cli-toolkit', '@phantomguard/web-playground'],
              message: 'Dependencies point one way: front ends depend on core-engine.',
            },
          ],
        },
      ],
    },
  },

  // The browser app: hooks rules.
  {
    files: ['packages/web-playground/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Tool config files must default-export, and the Vite config sits outside the app's tsconfig,
  // so it gets syntax-only linting.
  {
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use a string-literal union instead of an enum.',
        },
      ],
    },
  },
  {
    files: ['packages/web-playground/vite.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Plain JavaScript (config and scripts): no type information.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
