import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jest from 'eslint-plugin-jest';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', 'coverage/**'],
  },

  // Base TypeScript configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.eslint.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'import': importPlugin,
    },
    rules: {
      // TypeScript recommended rules
      ...typescript.configs.recommended.rules,
      // General rules
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      // Import/export rules
      'import/no-duplicates': 'error',
      'import/no-unused-modules': 'warn',
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_|^req$|^res$|^next$',
          varsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Source code specific rules
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // 'no-console': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },

  // Test utilities and setup
  {
    files: ['tests/utils/**/*.ts', 'tests/domain/**/*.ts', 'tests/setup.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        expect: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off', // Allow namespace for Jest type extensions
      'no-console': 'off',
    },
  },

  // Actual test files with strict Jest rules
  {
    files: [
      'tests/specs/**/*.test.ts',
      'tests/specs/**/*.spec.ts',
      '**/__tests__/**/*.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
    languageOptions: {
      globals: {
        ...jest.environments.globals.globals,
      },
    },
    plugins: {
      jest,
    },
    rules: {
      // Jest recommended rules - keep them strict for actual tests
      ...jest.configs.recommended.rules,
      // Only relax specific rules that make sense for tests
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/prefer-to-have-length': 'warn',
      'jest/no-commented-out-tests': 'warn',
      'jest/no-jasmine-globals': 'error', // Enforce using expect.fail() instead of fail()
      'jest/no-conditional-expect': 'warn', // Allow try-catch expect patterns for error testing
      'no-console': 'off',
    },
  },

  prettierConfig,
];
