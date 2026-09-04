import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.spec.ts'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@praxis/commons': path.resolve(__dirname, '../commons'),
    },
  },
});
