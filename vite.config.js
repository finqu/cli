import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

// Create a list of Node.js built-in modules to exclude from bundling
const nodeBuiltins = builtinModules.flatMap((m) => [m, `node:${m}`]);

export default defineConfig({
  build: {
    // Build for Node.js
    target: 'node18',
    // Output directory
    outDir: 'dist',
    // Build as a library
    lib: {
      // Entry point
      entry: resolve(__dirname, 'src/cli.js'),
      // Output format as an ES module
      formats: ['es'],
      // Output filename
      fileName: 'index',
    },
    // Rollup options
    rollupOptions: {
      // External packages that shouldn't be bundled
      external: [
        ...nodeBuiltins,
        /^node:/,
        /^[a-z0-9@][a-z0-9._-]*$/, // Externalize all bare module imports
      ],
      output: {
        // Don't add banner here, we'll add it directly to cli.js
        // banner: '#!/usr/bin/env node',
      },
    },
    // Ensure we have the proper Node.js shebang at the top of the output file
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    // Vitest configuration
    globals: true, // Enable global test APIs like describe, expect, etc.
    environment: 'node',
    include: ['__tests__/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./vitest.setup.js'],
  },
});
