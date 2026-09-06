import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    reporters: ['default'],
    testTimeout: 20000,
    fileParallelism: false,
  },
});
