import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Only repositories/, jobs/, scripts/ (and tests) may import Mongoose models. */
const modelImportRule = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['**/models', '**/models/*', '**/models/**'],
          message: 'Models are imported only from repositories/, jobs/ and scripts/. Use a repository.',
        },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/web/dev-dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { URL: 'readonly', console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/repositories/**', 'apps/api/src/jobs/**', 'apps/api/src/models/**'],
    rules: modelImportRule,
  },
);
