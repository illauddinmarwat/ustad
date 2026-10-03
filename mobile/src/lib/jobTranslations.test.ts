import { loadJobTranslations } from './jobTranslations';

const mockRpc = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

beforeEach(() => mockRpc.mockReset());

describe('loadJobTranslations', () => {
  it('returns the translations by job id', async () => {
    mockRpc.mockResolvedValue({
      data: [{ job_id: 'j1', title_i18n: { en: 'Tap', ur: 'نل' }, description_i18n: null }],
      error: null,
    });
    expect(await loadJobTranslations(['j1', 'j2'])).toEqual({
      j1: { title_i18n: { en: 'Tap', ur: 'نل' }, description_i18n: null },
    });
    expect(mockRpc).toHaveBeenCalledWith('job_translations', { p_job_ids: ['j1', 'j2'] });
  });

  it('asks for nothing and returns nothing for no ids', async () => {
    expect(await loadJobTranslations([])).toEqual({});
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns nothing when the call fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await loadJobTranslations(['j1'])).toEqual({});
  });
});
