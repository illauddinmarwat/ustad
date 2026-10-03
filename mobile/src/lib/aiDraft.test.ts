import {
  AI_ERROR_STRING,
  askQuestions,
  fetchAiHelpEnabled,
  getDeviceId,
  makeJobDraft,
  makeListingDraft,
  resetAiFlagCache,
  translateFields,
} from './aiDraft';

const mockInvoke = jest.fn();
const mockMaybeSingle = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: (...a: unknown[]) => mockGetItem(...a), setItem: (...a: unknown[]) => mockSetItem(...a) },
}));
jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }) }),
  },
}));

beforeEach(() => {
  [mockInvoke, mockMaybeSingle, mockGetItem, mockSetItem].forEach((m) => m.mockReset());
  mockGetItem.mockResolvedValue('device-1');
  resetAiFlagCache();
});

describe('fetchAiHelpEnabled', () => {
  it('reads the flag and remembers it for a minute', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: true }, error: null });
    expect(await fetchAiHelpEnabled()).toBe(true);
    mockMaybeSingle.mockResolvedValue({ data: { value: false }, error: null });
    expect(await fetchAiHelpEnabled()).toBe(true);
  });

  it('is off when the flag is false, missing, or cannot be read', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: false }, error: null });
    expect(await fetchAiHelpEnabled()).toBe(false);
    resetAiFlagCache();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await fetchAiHelpEnabled()).toBe(false);
    resetAiFlagCache();
    mockMaybeSingle.mockRejectedValue(new Error('offline'));
    expect(await fetchAiHelpEnabled()).toBe(false);
  });
});

describe('getDeviceId', () => {
  it('returns the stored id', async () => {
    expect(await getDeviceId()).toBe('device-1');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('creates and stores one the first time', async () => {
    mockGetItem.mockResolvedValue(null);
    const id = await getDeviceId();
    expect(id.length).toBeGreaterThan(8);
    expect(mockSetItem).toHaveBeenCalledWith('ustad.deviceId', id);
  });

  it('is blank when storage fails', async () => {
    mockGetItem.mockRejectedValue(new Error('x'));
    expect(await getDeviceId()).toBe('');
  });
});

describe('calling the function', () => {
  it('asks for questions with the device id and returns them', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, action: 'questions', data: { questions: [{ id: 'q1', text: 'Where?', options: ['Tap', 'Pipe'] }] } },
      error: null,
    });
    const r = await askQuestions({ kind: 'job', lang: 'en', text: 'Tap leaking', categories: ['plumber'] });
    expect(r).toEqual({ ok: true, data: [{ id: 'q1', text: 'Where?', options: ['Tap', 'Pipe'] }] });
    expect(mockInvoke).toHaveBeenCalledWith('ai-draft', {
      body: { action: 'questions', kind: 'job', lang: 'en', text: 'Tap leaking', categories: ['plumber'] },
      headers: { 'x-device-id': 'device-1' },
    });
  });

  it('returns a job draft and a listing draft', async () => {
    const draft = { source: 'en', title: { en: 'a', ur: 'ب' } };
    mockInvoke.mockResolvedValue({ data: { ok: true, action: 'draft', data: { draft } }, error: null });
    expect(await makeJobDraft({ lang: 'en', text: 'x' })).toEqual({ ok: true, data: draft });
    expect(mockInvoke.mock.calls[0][1].body).toMatchObject({ action: 'draft', kind: 'job' });
    expect(await makeListingDraft({ lang: 'ur', text: 'y' })).toEqual({ ok: true, data: draft });
    expect(mockInvoke.mock.calls[1][1].body).toMatchObject({ action: 'draft', kind: 'listing' });
  });

  it('translates fields', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, action: 'translate', data: { fields: { title: 'نل لیک' }, to: 'ur' } }, error: null });
    expect(await translateFields('job', 'en', { title: 'Leaking tap' })).toEqual({ ok: true, data: { title: 'نل لیک' } });
    expect(mockInvoke.mock.calls[0][1].body).toEqual({ action: 'translate', kind: 'job', from: 'en', fields: { title: 'Leaking tap' } });
  });

  it('passes the function error codes through', async () => {
    for (const code of ['limit', 'disabled', 'contact', 'blocked'] as const) {
      mockInvoke.mockResolvedValue({ data: { ok: false, error: code }, error: null });
      expect(await askQuestions({ kind: 'job', lang: 'en', text: 'x' })).toEqual({ ok: false, error: code });
    }
  });

  it('turns network errors, bad answers and unknown codes into ai_failed', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await askQuestions({ kind: 'job', lang: 'en', text: 'x' })).toEqual({ ok: false, error: 'ai_failed' });
    mockInvoke.mockResolvedValue({ data: 'oops', error: null });
    expect(await askQuestions({ kind: 'job', lang: 'en', text: 'x' })).toEqual({ ok: false, error: 'ai_failed' });
    mockInvoke.mockResolvedValue({ data: { ok: false, error: 'weird' }, error: null });
    expect(await askQuestions({ kind: 'job', lang: 'en', text: 'x' })).toEqual({ ok: false, error: 'ai_failed' });
    mockInvoke.mockRejectedValue(new Error('offline'));
    expect(await askQuestions({ kind: 'job', lang: 'en', text: 'x' })).toEqual({ ok: false, error: 'ai_failed' });
  });
});

describe('AI_ERROR_STRING', () => {
  it('has a message for every error code', () => {
    expect(Object.keys(AI_ERROR_STRING).sort()).toEqual(['ai_failed', 'bad_request', 'blocked', 'contact', 'disabled', 'limit']);
  });
});
