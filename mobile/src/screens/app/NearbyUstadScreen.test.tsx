import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NearbyUstadScreen from './NearbyUstadScreen';

const mockNavigate = jest.fn();
const mockRpc = jest.fn();
const mockParams: { current: { category?: string } | undefined } = { current: undefined };
const mockPosting = { current: false };
const mockDirect = { current: false };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: true }),
  getCurrentPositionAsync: () => Promise.resolve({ coords: { latitude: 24.86, longitude: 67.0 } }),
  Accuracy: { Balanced: 3 },
}));
jest.mock('../../lib/directRequests', () => ({
  ...jest.requireActual('../../lib/directRequests'),
  fetchDirectRequestFlags: () => Promise.resolve({ enabled: mockDirect.current }),
}));
jest.mock('../../lib/jobPosting', () => ({
  fetchJobPostingEnabled: () => Promise.resolve(mockPosting.current),
}));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const worker = {
  user_id: 'w1',
  display_name: 'Usman',
  city: 'Karachi',
  bio: null,
  categories: ['plumber'],
  avg_rating: 4.5,
  review_count: 10,
  is_verified: true,
  rate_pkr: 800,
  rate_unit: 'hour',
  years_experience: 6,
  photo_url: null,
  distance_km: 1.2,
  is_available: true,
};

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <NearbyUstadScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockRpc.mockReset().mockResolvedValue({ data: [worker], error: null });
  mockParams.current = undefined;
  mockPosting.current = false;
  mockDirect.current = false;
});

describe('NearbyUstadScreen', () => {
  it('has no phone or call button on worker cards', async () => {
    const { findByText, queryByText } = wrap();
    await findByText(/Usman/);
    expect(queryByText('Call Now')).toBeNull();
  });

  it('links to Services in the chosen category', async () => {
    mockParams.current = { category: 'plumber' };
    const { findByText } = wrap();
    fireEvent.press(await findByText('See services in this category'));
    expect(mockNavigate).toHaveBeenCalledWith('Services', { category: 'plumber' });
  });

  it('hides the Services link when no category is chosen', async () => {
    const { findByText, queryByText } = wrap();
    await findByText(/Usman/);
    expect(queryByText('See services in this category')).toBeNull();
  });

  it('sends the request screen the worker and the active category when direct requests are on', async () => {
    mockDirect.current = true;
    mockParams.current = { category: 'plumber' };
    const { findByText } = wrap();
    fireEvent.press(await findByText('Send request'));
    expect(mockNavigate).toHaveBeenCalledWith('RequestWorker', { workerId: 'w1', workerName: 'Usman', category: 'plumber' });
  });

  it('offers to post a job when nothing is nearby and job posting is on', async () => {
    mockPosting.current = true;
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { findByText, getByText } = wrap();
    await findByText('Post a job instead');
    await act(async () => {}); // let the screen settle so the button we press is the mounted one
    fireEvent.press(getByText('Post a job instead'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PostJob'));
  });
});
