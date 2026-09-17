import { addAnonToken, claimAllAnonJobs, clearAnonTokens, fetchOwnAnonJobs, generateAnonToken, listAnonTokens, removeAnonToken } from './anonJobs';

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (mockStorage.has(key) ? mockStorage.get(key)! : null)),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
  },
}));

const mockRpc = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockStorage.clear();
  mockRpc.mockReset();
});

describe('generateAnonToken', () => {
  it('returns a UUID v4 shaped string', () => {
    const token = generateAnonToken();
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('produces a different token each call (practically)', () => {
    const a = generateAnonToken();
    const b = generateAnonToken();
    expect(a).not.toBe(b);
  });
});

describe('token storage', () => {
  it('stores, lists, and removes tokens', async () => {
    expect(await listAnonTokens()).toEqual([]);
    await addAnonToken('t-1');
    await addAnonToken('t-2');
    await addAnonToken('t-1');
    expect(await listAnonTokens()).toEqual(['t-1', 't-2']);
    await removeAnonToken('t-1');
    expect(await listAnonTokens()).toEqual(['t-2']);
    await clearAnonTokens();
    expect(await listAnonTokens()).toEqual([]);
  });

  it('ignores empty token values', async () => {
    await addAnonToken('');
    expect(await listAnonTokens()).toEqual([]);
  });
});

describe('fetchOwnAnonJobs', () => {
  it('returns empty when no tokens stored', async () => {
    expect(await fetchOwnAnonJobs()).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls get_anon_job for each token and returns its row', async () => {
    await addAnonToken('t-1');
    await addAnonToken('t-2');
    mockRpc.mockImplementation((name: string, args: { p_token: string }) => {
      expect(name).toBe('get_anon_job');
      return Promise.resolve({
        data: [{
          id: `job-${args.p_token}`,
          title: `Job ${args.p_token}`,
          description: null,
          category: 'general',
          status: 'open',
          location_text: null,
          worker_id: null,
          created_at: '2026-05-12T00:00:00Z',
          origin: 'customer_job',
          posted_by_anon: true,
        }],
        error: null,
      });
    });
    const rows = await fetchOwnAnonJobs();
    expect(rows.map((r) => r.id).sort()).toEqual(['job-t-1', 'job-t-2']);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});

describe('claimAllAnonJobs', () => {
  it('claims every token and removes the successful ones', async () => {
    await addAnonToken('good-1');
    await addAnonToken('bad-1');
    await addAnonToken('good-2');
    mockRpc.mockImplementation((_name: string, args: { p_token: string }) => {
      if (args.p_token === 'bad-1') return Promise.resolve({ data: null, error: { message: 'gone' } });
      return Promise.resolve({ data: `claimed-${args.p_token}`, error: null });
    });
    const result = await claimAllAnonJobs();
    expect(result).toEqual({ claimed: 2, failed: 1 });
    expect(await listAnonTokens()).toEqual(['bad-1']);
  });

  it('returns zero counts when there are no tokens', async () => {
    expect(await claimAllAnonJobs()).toEqual({ claimed: 0, failed: 0 });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
