import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read package.json to get version (same as vite.config.js)
const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'),
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
