import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.{js,ts}'],
    testTimeout: 10000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
});