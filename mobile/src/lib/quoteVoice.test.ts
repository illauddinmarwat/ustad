import { attachQuoteVoice, sendThreadVoice, signedVoiceUrl } from './quoteVoice';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockSigned = jest.fn();
const mockRpc = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: {
      from: (bucket: string) => ({
        upload: (...a: unknown[]) => mockUpload(bucket, ...a),
        remove: (...a: unknown[]) => mockRemove(bucket, ...a),
        createSignedUrl: (...a: unknown[]) => mockSigned(bucket, ...a),
      }),
    },
  },
}));
jest.mock('./workerUploads', () => ({ readBody: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))) }));

const note = { uri: 'file:///rec.m4a', seconds: 12 };

beforeEach(() => {
  [mockUpload, mockRemove, mockSigned, mockRpc].forEach((m) => m.mockReset());
  mockRemove.mockResolvedValue({ error: null });
});

describe('attachQuoteVoice', () => {
  it('uploads into the private bucket under the worker and job, then attaches it to the quote', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await attachQuoteVoice('w1', 'j1', 'q1', note)).toBeNull();
    const [bucket, path, , options] = mockUpload.mock.calls[0] as [string, string, unknown, { contentType: string }];
    expect(bucket).toBe('quote-voice');
    expect(path).toMatch(/^w1\/j1\/.+\.m4a$/);
    expect(options.contentType).toBe('audio/mp4');
    expect(mockRpc).toHaveBeenCalledWith('worker_attach_quote_voice', { p_quote_id: 'q1', p_path: path, p_seconds: 12 });
  });

  it('returns the server message and deletes the file when attaching fails', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'quote is not pending' } });
    expect(await attachQuoteVoice('w1', 'j1', 'q1', note)).toBe('quote is not pending');
    expect(mockRemove).toHaveBeenCalledWith('quote-voice', [mockUpload.mock.calls[0][1]]);
  });

  it('does not call the server when the upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'network' } });
    expect(await attachQuoteVoice('w1', 'j1', 'q1', note)).toBe('network');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('sendThreadVoice', () => {
  it('uploads and posts into the thread with the worker the conversation is with', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await sendThreadVoice('c1', 'j1', 'w1', note)).toBeNull();
    const path = mockUpload.mock.calls[0][1] as string;
    expect(path).toMatch(/^c1\/j1\//);
    expect(mockRpc).toHaveBeenCalledWith('post_thread_voice', { p_job_id: 'j1', p_worker_id: 'w1', p_path: path, p_seconds: 12 });
  });

  it('cleans up when the thread refuses it', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not allowed' } });
    expect(await sendThreadVoice('c1', 'j1', 'w1', note)).toBe('not allowed');
    expect(mockRemove).toHaveBeenCalled();
  });
});

describe('signedVoiceUrl', () => {
  it('returns a link, or null when the caller may not hear it', async () => {
    mockSigned.mockResolvedValue({ data: { signedUrl: 'https://x/y' }, error: null });
    expect(await signedVoiceUrl('w1/j1/a.m4a')).toBe('https://x/y');
    expect(mockSigned).toHaveBeenCalledWith('quote-voice', 'w1/j1/a.m4a', 3600);
    mockSigned.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    expect(await signedVoiceUrl('w1/j1/a.m4a')).toBeNull();
    mockSigned.mockRejectedValue(new Error('offline'));
    expect(await signedVoiceUrl('w1/j1/a.m4a')).toBeNull();
  });
});
