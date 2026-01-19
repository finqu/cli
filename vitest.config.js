import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./vitest.setup.js'],
    // Add Jest compatibility mode
    compatibility: {
      jest: true,
    },
    // Configure coverage using the v8 provider
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/__tests__/**'],
      all: true,
      reportsDirectory: './coverage',
    },
  },
});
