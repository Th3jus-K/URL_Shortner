import type { Config } from 'jest';

const common: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
};

const config: Config = {
  projects: [
    {
      ...common,
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      ...common,
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      testTimeout: 30000,
    },
  ],
};

export default config;
