import { badgeValue, notificationTarget } from './notificationHelpers';
import { registerForPush, unregisterPush } from './notifications';

const mockRpc = jest.fn();
const mockDevice = { isDevice: true };
const mockPerms = { status: 'granted' as string };

jest.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } }, easConfig: null },
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: () => Promise.resolve({ status: mockPerms.status }),
  requestPermissionsAsync: () => Promise.resolve({ status: mockPerms.status }),
  getExpoPushTokenAsync: () => Promise.resolve({ data: 'ExponentPushToken[abc]' }),
  setNotificationHandler: jest.fn(),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

beforeEach(() => {
  mockRpc.mockReset();
  mockDevice.isDevice = true;
  mockPerms.status = 'granted';
});

describe('badgeValue', () => {
  it('hides zero and caps large counts', () => {
    expect(badgeValue(0)).toBeUndefined();
    expect(badgeValue(4)).toBe(4);
    expect(badgeValue(250)).toBe(99);
  });
});

describe('notificationTarget', () => {
  it('opens the job when there is one, otherwise the applications inbox', () => {
    expect(notificationTarget('job_closed', 'j1')).toEqual({ screen: 'JobDetail', params: { jobId: 'j1' } });
    expect(notificationTarget('application_received', null)).toEqual({ screen: 'Applications' });
  });
});

describe('push registration', () => {
  it('registers the Expo token for the signed-in user', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await expect(registerForPush()).resolves.toBe('ExponentPushToken[abc]');
    expect(mockRpc).toHaveBeenCalledWith('register_device_token', {
      p_token: 'ExponentPushToken[abc]',
      p_platform: 'android',
    });
  });

  it('skips simulators and denied permission without calling the server', async () => {
    mockDevice.isDevice = false;
    await expect(registerForPush()).resolves.toBeNull();
    mockDevice.isDevice = true;
    mockPerms.status = 'denied';
    await expect(registerForPush()).resolves.toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('removes this device token on sign-out, once', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await registerForPush();
    mockRpc.mockClear();
    await unregisterPush();
    await unregisterPush();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('unregister_device_token', { p_token: 'ExponentPushToken[abc]' });
  });
});
