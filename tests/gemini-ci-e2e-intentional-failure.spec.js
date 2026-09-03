const { test, expect } = require('@playwright/test');

test('intentional failure for Gemini CI analyzer E2E — DO NOT MERGE', async () => {
  expect('gemini-ci-analyzer').toBe('intentional-failure');
});
