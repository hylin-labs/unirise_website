import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'next/image': fileURLToPath(
        new URL('./node_modules/vinext/dist/shims/image.js', import.meta.url),
      ),
      'next/link': fileURLToPath(
        new URL('./node_modules/vinext/dist/shims/link.js', import.meta.url),
      ),
      'cloudflare:workers': fileURLToPath(
        new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url),
      ),
      'next/navigation': fileURLToPath(
        new URL('./tests/stubs/next-navigation.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
