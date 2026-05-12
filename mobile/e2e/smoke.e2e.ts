import { by, device, element, expect } from 'detox';

const run = process.env.RUN_E2E === '1' ? describe : describe.skip;

run('App smoke (Detox)', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('shows Sign in screen', async () => {
    await expect(element(by.text('Sign in'))).toBeVisible();
  });
});
