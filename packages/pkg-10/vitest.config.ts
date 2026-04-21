import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
  },
});
