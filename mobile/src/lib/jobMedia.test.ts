import {
  describeMediaCounts,
  uploadJobAudio,
  uploadJobPhoto,
  uploadJobPhotos,
  uploadJobVideo,
  uploadJobVideoClip,
  uploadJobVoice,
} from './jobMedia';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockRpc = jest.fn();

const mockGetInfo = jest.fn();
const mockCreateTask = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...a: unknown[]) => mockGetInfo(...a),
  createUploadTask: (...a: unknown[]) => mockCreateTask(...a),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

jest.mock('./supabase', () => ({
  supabaseUrl: 'https://proj.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a), remove: (...a: unknown[]) => mockRemove(...a) }) },
  },
}));
jest.mock('./voiceNote', () => jest.requireActual('./voiceNote'));
jest.mock('./workerUploads', () => ({ readBody: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))) }));

beforeEach(() => {
  [mockUpload, mockRemove, mockRpc, mockGetInfo, mockCreateTask].forEach((m) => m.mockReset());
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

describe('uploadJobVideo', () => {
  const clip = { uri: 'file:///clip.mp4', seconds: 20 };
  const okTask = (progress?: (p: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void) => ({
    uploadAsync: () => {
      progress?.({ totalBytesSent: 50, totalBytesExpectedToSend: 100 });
      return Promise.resolve({ status: 200 });
    },
  });

  beforeEach(() => {
    mockGetInfo.mockResolvedValue({ exists: true, size: 5_000_000 });
    mockRemove.mockResolvedValue({ error: null });
  });

  it('streams the file with the user token, reports progress and registers it', async () => {
    mockCreateTask.mockImplementation((_url: string, _uri: string, _opts: unknown, cb: never) => okTask(cb));
    mockRpc.mockResolvedValue({ data: 'm1', error: null });
    const progress: number[] = [];
    await uploadJobVideo('u1', 'j1', clip, (f) => progress.push(f));

    const [url, uri, options] = mockCreateTask.mock.calls[0] as [string, string, { headers: Record<string, string> }];
    expect(url).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/job-media\/u1\/j1\/.+\.mp4$/);
    expect(uri).toBe('file:///clip.mp4');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer tok', apikey: 'anon-key', 'Content-Type': 'video/mp4' });
    expect(progress).toContain(0.5);
    expect(mockRpc).toHaveBeenCalledWith('add_job_media', expect.objectContaining({ p_kind: 'video', p_bytes: 5_000_000, p_duration_s: 20 }));
  });

  it('refuses a video over the limit without uploading', async () => {
    mockGetInfo.mockResolvedValue({ exists: true, size: 30 * 1024 * 1024 });
    await expect(uploadJobVideo('u1', 'j1', clip)).rejects.toThrow('VIDEO_TOO_LARGE');
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('retries a failed transfer and succeeds on the third attempt', async () => {
    jest.useFakeTimers();
    let calls = 0;
    mockCreateTask.mockImplementation(() => ({
      uploadAsync: () => (++calls < 3 ? Promise.resolve({ status: 500 }) : Promise.resolve({ status: 200 })),
    }));
    mockRpc.mockResolvedValue({ data: 'm1', error: null });
    const done = uploadJobVideo('u1', 'j1', clip);
    await jest.advanceTimersByTimeAsync(10_000);
    await done;
    expect(calls).toBe(3);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('gives up after three attempts and registers nothing', async () => {
    jest.useFakeTimers();
    mockCreateTask.mockImplementation(() => ({ uploadAsync: () => Promise.resolve({ status: 503 }) }));
    const done = uploadJobVideo('u1', 'j1', clip);
    const assertion = expect(done).rejects.toThrow('Upload failed (503)');
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(mockCreateTask).toHaveBeenCalledTimes(3);
    expect(mockRpc).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('deletes the stored file when registering fails', async () => {
    mockCreateTask.mockImplementation(() => okTask());
    mockRpc.mockResolvedValue({ data: null, error: { message: 'limit reached for this media type' } });
    await expect(uploadJobVideo('u1', 'j1', clip)).rejects.toThrow('limit reached');
    expect(mockRemove).toHaveBeenCalled();
  });

  it('reports too large without throwing when used for a post', async () => {
    mockGetInfo.mockResolvedValue({ exists: true, size: 30 * 1024 * 1024 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await uploadJobVideoClip('u1', 'j1', clip)).toEqual({ failed: 1, tooLarge: true });
    warn.mockRestore();
  });
});
