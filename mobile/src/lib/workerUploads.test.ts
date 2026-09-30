const mockStore: Record<string, string> = {};
const mockUpload = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(mockStore[k] ?? null),
    setItem: (k: string, v: string) => {
      mockStore[k] = v;
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      delete mockStore[k];
      return Promise.resolve();
    },
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('/9j/4AAQSkZJRg==')),
}));

jest.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mockUpload(...a),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }),
      }),
    },
    from: () => ({ update: (u: unknown) => ({ eq: () => mockUpdate(u) }) }),
  },
}));

import { flushPendingUploads, stashPendingUploads } from './workerUploads';

const KEY = 'ustad.pendingWorkerUploads.v1';

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockUpdate.mockReset().mockResolvedValue({ error: null });
});

describe('pending worker uploads', () => {
  it('stashes on sign-up and uploads then clears on the matching first login', async () => {
    await stashPendingUploads('Ali@Example.com', { photo: 'file:///a.jpg', cnicFront: 'file:///b.jpg', cnicBack: 'file:///c.jpg' });
    expect(mockStore[KEY]).toBeTruthy();

    await flushPendingUploads('user-1', 'ali@example.com');

    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ cnic_front_url: 'user-1/cnic-front.jpg', cnic_back_url: 'user-1/cnic-back.jpg' })
    );
    expect(mockStore[KEY]).toBeUndefined();
  });

  it('ignores a different account and keeps the stash', async () => {
    await stashPendingUploads('ali@example.com', { photo: 'file:///a.jpg' });
    await flushPendingUploads('user-2', 'someone-else@example.com');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockStore[KEY]).toBeTruthy();
  });

  it('keeps the stash when an upload fails so it retries next login', async () => {
    await stashPendingUploads('ali@example.com', { photo: 'file:///a.jpg' });
    mockUpload.mockResolvedValue({ error: { message: 'boom' } });
    await flushPendingUploads('user-1', 'ali@example.com');
    expect(mockStore[KEY]).toBeTruthy();
  });
});
