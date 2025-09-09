/** @type {import('jest').Config} */
module.exports = {
  // TypeScript support
  testEnvironment: 'node',

  // Test file paths
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.spec.ts'],

  // Coverage configuration
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Module path mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },

  // Timeout and concurrency settings
  testTimeout: 60000, // 60s for integration tests
  maxWorkers: 1, // Run integration tests sequentially to avoid conflicts

  // Test result display
  silent: false,
  displayName: 'XRPL Stablecoin Flow Tests',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Mock cleanup
  clearMocks: true,
  restoreMocks: true,

  // Error handling
  errorOnDeprecated: true,

  // TypeScript configuration
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },

  // Ignore transformed modules
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|@grpc/.*|firebase-admin/.*))'],
};
