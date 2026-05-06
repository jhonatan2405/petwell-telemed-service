/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/config/**',
    '!src/models/**'
  ],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  clearMocks: true,
  setupFilesAfterEnv: [],
};
