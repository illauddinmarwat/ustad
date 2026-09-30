import { describeMediaCounts, uploadJobAudio, uploadJobPhoto, uploadJobPhotos, uploadJobVoice } from './jobMedia';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockRpc = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a), remove: (...a: unknown[]) => mockRemove(...a) }) },
  },
}));
jest.mock('./voiceNote', () => jest.requireActual('./voiceNote'));
jest.mock('./workerUploads', () => ({ readBody: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))) }));

beforeEach(() => {
  [mockUpload, mockRemove, mockRpc].forEach((m) => m.mockReset());
});

describe('describeMediaCounts', () => {
  it('lists what is attached', () => {
    expect(describeMediaCounts({ photos: 2, audios: 1, videos: 0 })).toBe('2 photos, 1 voice note');
    expect(describeMediaCounts({ photos: 1, audios: 0, videos: 1 })).toBe('1 photo, 1 video');
  });
  it('is null when nothing is attached', () => {
    expect(describeMediaCounts({ photos: 0, audios: 0, videos: 0 })).toBeNull();
    expect(describeMediaCounts(undefined)).toBeNull();
  });
});

describe('uploadJobPhoto', () => {
  it('uploads into the customer and job folder, then registers the file', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: 'm1', error: null });
    await uploadJobPhoto('u1', 'j1', 'file:///a.jpg');
    const path = mockUpload.mock.calls[0][0] as string;
    expect(path).toMatch(/^u1\/j1\/.+\.jpg$/);
    expect(mockRpc).toHaveBeenCalledWith('add_job_media', expect.objectContaining({ p_job_id: 'j1', p_kind: 'photo', p_path: path, p_bytes: 3 }));
  });

  it('deletes the stored file when registering it fails', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'limit reached for this media type' } });
    await expect(uploadJobPhoto('u1', 'j1', 'file:///a.jpg')).rejects.toThrow('limit reached for this media type');
    expect(mockRemove).toHaveBeenCalledWith([mockUpload.mock.calls[0][0]]);
  });

  it('fails without registering when the upload itself fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'network' } });
    await expect(uploadJobPhoto('u1', 'j1', 'file:///a.jpg')).rejects.toThrow('network');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('uploadJobAudio', () => {
  it('uploads with the right type and registers the length', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: 'm1', error: null });
    await uploadJobAudio('u1', 'j1', { uri: 'file:///rec.m4a', seconds: 42 });
    const [path, , options] = mockUpload.mock.calls[0] as [string, unknown, { contentType: string }];
    expect(path).toMatch(/^u1\/j1\/.+\.m4a$/);
    expect(options.contentType).toBe('audio/mp4');
    expect(mockRpc).toHaveBeenCalledWith('add_job_media', expect.objectContaining({ p_kind: 'audio', p_bytes: 3, p_duration_s: 42, p_path: path }));
  });

  it('deletes the stored file when registering fails', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'limit reached for this media type' } });
    await expect(uploadJobAudio('u1', 'j1', { uri: 'file:///rec.m4a', seconds: 5 })).rejects.toThrow('limit reached');
    expect(mockRemove).toHaveBeenCalledWith([mockUpload.mock.calls[0][0]]);
  });

  it('reports a failure instead of throwing when used for a post', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'network' } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await uploadJobVoice('u1', 'j1', { uri: 'file:///rec.m4a', seconds: 5 })).toEqual({ failed: 1 });
    warn.mockRestore();
  });
});

describe('uploadJobPhotos', () => {
  it('keeps going after a failure and reports how many failed', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'x' } }).mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: 'm', error: null });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await uploadJobPhotos('u1', 'j1', ['a', 'b', 'c']);
    expect(res).toEqual({ failed: 1 });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('uploads at most four photos', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: 'm', error: null });
    await uploadJobPhotos('u1', 'j1', ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(mockUpload).toHaveBeenCalledTimes(4);
  });
});
