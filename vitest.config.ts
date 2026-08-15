import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Live tests hit the real Google API and need credentials, so the default
    // run stays hermetic. Opt in explicitly with `npm run test:live:docs`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.live.test.ts'],
    env: {
      LOG_LEVEL: 'silent',
    },
  },
});
