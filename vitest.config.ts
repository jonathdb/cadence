import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@/assets': path.resolve(__dirname, './assets'),
      '@': path.resolve(__dirname, './src'),
      // Map Deno-style ESM imports to local node_modules for testing
      'https://esm.sh/@supabase/supabase-js@2': '@supabase/supabase-js',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec,prop}.ts', 'supabase/functions/**/*.test.ts'],
    setupFiles: ['tests/setup/test-helpers.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/types/**'],
    },
  },
});
