import { probeOnline } from './useOnline';

describe('probeOnline', () => {
  it('is online when the server answers, even with an error status', async () => {
    const f = jest.fn().mockResolvedValue({ status: 401 });
    await expect(probeOnline('https://x.test/health', f as never)).resolves.toBe(true);
  });

  it('is offline when the request fails', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(probeOnline('https://x.test/health', f as never)).resolves.toBe(false);
  });

  it('is offline when the request is aborted by the timeout', async () => {
    jest.useFakeTimers();
    const f = jest.fn((_u: string, init: { signal: AbortSignal }) =>
      new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    const p = probeOnline('https://x.test/health', f as never);
    await jest.advanceTimersByTimeAsync(7000);
    await expect(p).resolves.toBe(false);
    jest.useRealTimers();
  });
});
