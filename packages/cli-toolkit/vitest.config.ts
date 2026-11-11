import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The CLI has no tests yet (tasks.md, task 5.6); an empty suite must not fail the pipeline.
    // Delete this line when the first test lands.
    passWithNoTests: true,
  },
});
