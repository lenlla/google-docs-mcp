import { defineConfig } from 'vitest/config';

/**
 * Opt-in config for the live tests, which hit the real Google API and need
 * credentials. The default config (vitest.config.ts) excludes them so `npm test`
 * and CI stay hermetic; run these with `npm run test:live:docs`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    env: {
      LOG_LEVEL: 'silent',
    },
  },
});
