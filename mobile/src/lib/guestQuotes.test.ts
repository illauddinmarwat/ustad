import { countGuestQuotes } from './guestQuotes';

const mockRpc = jest.fn();
const mockJobs: { current: Array<{ jobId: string; token: string; title: string; createdAt: string }> } = { current: [] };

jest.mock('./jobPosting', () => ({ listGuestJobs: () => Promise.resolve(mockJobs.current) }));
jest.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const job = (n: number) => ({ jobId: `j${n}`, token: `t${n}`, title: `Job ${n}`, createdAt: '2026-10-04' });

describe('countGuestQuotes', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockJobs.current = [];
  });

  it('is zero when the guest has posted nothing', async () => {
    expect(await countGuestQuotes()).toEqual({ total: 0, byToken: {} });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('counts the waiting quotes on each job, using the job token', async () => {
    mockJobs.current = [job(1), job(2)];
    mockRpc.mockImplementation((_n: string, a: { p_job_id: string }) =>
      Promise.resolve({
        data: a.p_job_id === 'j1' ? [{ status: 'pending' }, { status: 'pending' }, { status: 'rejected' }] : [],
        error: null,
      }),
    );
    expect(await countGuestQuotes()).toEqual({ total: 2, byToken: { t1: 2 } });
    expect(mockRpc).toHaveBeenCalledWith('job_quotes', { p_job_id: 'j1', p_token: 't1' });
  });

  it('skips a job that cannot be read and still counts the others', async () => {
    mockJobs.current = [job(1), job(2)];
    mockRpc.mockImplementation((_n: string, a: { p_job_id: string }) =>
      a.p_job_id === 'j1' ? Promise.reject(new Error('offline')) : Promise.resolve({ data: [{ status: 'pending' }], error: null }),
    );
    expect(await countGuestQuotes()).toEqual({ total: 1, byToken: { t2: 1 } });
  });

  it('looks at no more than five jobs', async () => {
    mockJobs.current = [1, 2, 3, 4, 5, 6, 7].map(job);
    mockRpc.mockResolvedValue({ data: [], error: null });
    await countGuestQuotes();
    expect(mockRpc).toHaveBeenCalledTimes(5);
  });
});
