// ordersight-fe/eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: ['dist'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Base TS / React rules
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /**
       * NAMED EXPORTS / IMPORTS (NON-NEGOTIABLE)
       * First principles:
       * - Default exports obscure module boundaries
       * - Named exports improve refactors, clarity, and tree-shaking
       */
      'import/no-default-export': 'error',
      'import/no-named-as-default': 'error',
      'import/no-named-as-default-member': 'error',

      /**
       * Optional but helpful hygiene
       */
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
    },
  },

  /**
   * Node-only tooling/config files (Vite/Vitest/ESLint).
   * These run in Node (ESM), not the browser.
   */
  {
    files: [
      'eslint.config.js',
      'vite.config.js',
      'vitest.config.js',
      '**/*.config.js',
      'dev/**/*.js',
      'scripts/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.nodeBuiltin,
    },
    rules: {
      'import/no-default-export': 'off',
    },
  },
  {
    files: [
      'vite.config.ts',
      'vitest.config.ts',
      '**/*.config.ts',
      'dev/**/*.ts',
      'scripts/**/*.ts',
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: globals.nodeBuiltin,
    },
    rules: {
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['vite.config.d.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },

  /**
   * ROUTE CODE-SPLITTING GUARDRAILS
   */
  {
    files: ['src/routes.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                './pages/*',
                './pages/**',
                '../pages/*',
                '../pages/**',
                './features/*',
                './features/**',
                '../features/*',
                '../features/**',
              ],
              message:
                'Do not eagerly import pages/features in routes.tsx. Use React Router `lazy:` with dynamic import.',
            },
          ],
        },
      ],
    },
  },

  /**
   * NO BARREL / EXPORT HUB GUARDRAILS
   */
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                './components',
                './components/index',
                '../components',
                '../components/index',
                './features',
                './features/index',
                '../features',
                '../features/index',
              ],
              message: 'Avoid barrel/index hubs. Import directly from module files.',
            },
          ],
        },
      ],
    },
  },
];
