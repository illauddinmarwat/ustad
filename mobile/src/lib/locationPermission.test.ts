import { ensureForegroundLocation } from './locationPermission';

const mockRequest = jest.fn();
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: () => mockRequest() }));

describe('ensureForegroundLocation', () => {
  beforeEach(() => mockRequest.mockReset());

  it('shares one system prompt between callers that ask at the same time', async () => {
    mockRequest.mockResolvedValue({ granted: true });
    const [a, b] = await Promise.all([ensureForegroundLocation(), ensureForegroundLocation()]);
    expect(a && b).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('asks again later and treats a failure as not granted', async () => {
    mockRequest.mockRejectedValue(new Error('services off'));
    expect(await ensureForegroundLocation()).toBe(false);
    mockRequest.mockResolvedValue({ granted: true });
    expect(await ensureForegroundLocation()).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
