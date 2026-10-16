import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/models/**', 'src/types/**', 'src/infra/r2.ts', 'src/infra/mailer.ts', 'src/**/*.test.ts'],
      thresholds: { lines: 80, branches: 75, 'src/domain/**': { lines: 95, branches: 90 } },
    },
  },
});
