const mockRpc = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('../config/env', () => ({ useLiveDatabase: true }));

import { reportError, seenRecently } from './crashReporter';

describe('crashReporter', () => {
  beforeEach(() => mockRpc.mockReset().mockResolvedValue({ error: null }));

  it('sends the message, stack and flags to log_client_error', async () => {
    await reportError(new Error('first boom'), { componentStack: 'at Screen', fatal: true });
    expect(mockRpc).toHaveBeenCalledWith(
      'log_client_error',
      expect.objectContaining({ p_message: 'first boom', p_component_stack: 'at Screen', p_fatal: true }),
    );
  });

  it('does not send the same message twice within a minute', async () => {
    await reportError(new Error('loop'));
    await reportError(new Error('loop'));
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when the call fails', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    await expect(reportError(new Error('another'))).resolves.toBeUndefined();
  });

  it('seenRecently forgets a message after the window', () => {
    expect(seenRecently('x', 1000)).toBe(false);
    expect(seenRecently('x', 2000)).toBe(true);
    expect(seenRecently('x', 70000)).toBe(false);
  });
});
