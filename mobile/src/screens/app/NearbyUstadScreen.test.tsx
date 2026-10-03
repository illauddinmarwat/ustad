import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NearbyUstadScreen from './NearbyUstadScreen';

const mockNavigate = jest.fn();
const mockRpc = jest.fn();
const mockParams: { current: { category?: string } | undefined } = { current: undefined };
const mockPosting = { current: false };
const mockDirect = { current: false };
const mockLoc = { granted: true };
const mockForward = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: mockLoc.granted }),
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
jest.mock('../../lib/geocode', () => ({ forwardGeocode: (...a: unknown[]) => mockForward(...a) }));
jest.mock('../../lib/locations', () => ({
  useCities: () => ({
    items: [
      { id: 'k', name: 'Karachi' },
      { id: 'l', name: 'Lahore' },
    ],
    loading: false,
    failed: false,
    reload: jest.fn(),
  }),
}));
jest.mock('../../components/LocationPickerModal', () => {
  const { Text } = require('react-native');
  return {
    LocationPickerModal: ({ visible, onConfirm }: { visible: boolean; onConfirm: (l: { lat: number; lng: number }) => void }) =>
      visible ? <Text onPress={() => onConfirm({ lat: 31.5, lng: 74.3 })}>Confirm pin</Text> : null,
  };
});
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
  mockLoc.granted = true;
  mockForward.mockReset();
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

describe('NearbyUstadScreen without device location (a PC)', () => {
  beforeEach(() => {
    mockLoc.granted = false;
  });

  it('offers a city list and the map instead of a dead end, and explains how to turn location on', async () => {
    const { findByText, getByText } = wrap();
    expect(await findByText('Or choose where to look')).toBeTruthy();
    expect(getByText('Karachi')).toBeTruthy();
    expect(getByText('Lahore')).toBeTruthy();
    expect(getByText('Pick on the map')).toBeTruthy();
    expect(getByText(/Turn it on in Windows/)).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('looks for Ustads around a chosen city', async () => {
    mockForward.mockResolvedValue({ lat: 24.86, lng: 67.01, displayName: 'Karachi' });
    const { findByText, getByText } = wrap();
    fireEvent.press(await findByText('Karachi'));
    expect(await findByText('Showing Ustads near Karachi')).toBeTruthy();
    expect(mockForward).toHaveBeenCalledWith('Karachi, Pakistan');
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('nearby_workers', expect.objectContaining({ p_lat: 24.86, p_lng: 67.01 })),
    );
    expect(await findByText(/Usman/)).toBeTruthy();
    expect(getByText('Change')).toBeTruthy();
  });

  it('looks for Ustads around a pin on the map', async () => {
    const { findByText } = wrap();
    fireEvent.press(await findByText('Pick on the map'));
    fireEvent.press(await findByText('Confirm pin'));
    expect(await findByText('Showing Ustads near your pinned place')).toBeTruthy();
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('nearby_workers', expect.objectContaining({ p_lat: 31.5, p_lng: 74.3 })),
    );
  });

  it('says so when the place cannot be found', async () => {
    mockForward.mockResolvedValue(null);
    const { findByText } = wrap();
    fireEvent.press(await findByText('Karachi'));
    expect(await findByText('We could not find that place. Try the map.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('goes back to the device location when Change is tapped and it is available again', async () => {
    mockForward.mockResolvedValue({ lat: 24.86, lng: 67.01, displayName: 'Karachi' });
    const { findByText, queryByText } = wrap();
    fireEvent.press(await findByText('Karachi'));
    await findByText('Showing Ustads near Karachi');
    mockLoc.granted = true;
    fireEvent.press(await findByText('Change'));
    await waitFor(() => expect(queryByText('Showing Ustads near Karachi')).toBeNull());
  });
});

describe('NearbyUstadScreen prices', () => {
  it('shows no hourly or daily rate on a worker card', async () => {
    const { findByText, queryByText } = wrap();
    await findByText(/Usman/);
    expect(queryByText(/Rs 800/)).toBeNull();
    expect(queryByText(/\/hour/)).toBeNull();
  });
});
