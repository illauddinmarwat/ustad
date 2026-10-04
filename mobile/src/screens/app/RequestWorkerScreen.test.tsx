import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RequestWorkerScreen from './RequestWorkerScreen';

jest.mock('../../lib/useProfileCity', () => ({ useProfileCity: () => null }));
jest.mock('../../lib/myLocation', () => ({ getMyLocation: jest.fn(() => Promise.resolve(null)) }));
jest.mock('../../lib/locations', () => ({
  useCities: () => ({ items: [{ id: 'c1', name: 'Karachi' }], loading: false, failed: false, reload: jest.fn() }),
  useAreas: (cityId: string | null) => ({
    items: cityId ? [{ id: 'a1', name: 'Gulshan' }] : [],
    loading: false,
    failed: false,
    reload: jest.fn(),
  }),
}));

const mockNavigate = jest.fn();
const mockRpc = jest.fn();
const mockFlags: { enabled: boolean; quoteMarkup?: boolean } = { enabled: true };

const mockAuth: { current: { session: { user: { id: string } } | null } } = {
  current: { session: { user: { id: 'cust-1' } } },
};

jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));

const mockParams: { current: Record<string, unknown> } = {
  current: { workerId: 'worker-1', workerName: 'Usman', category: 'plumber' },
};
const mockListingFlag = { current: true };
const mockMediaFlag = { current: false };
const mockUploadPhotos = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('../../lib/listings', () => ({
  ...jest.requireActual('../../lib/listings'),
  fetchListingRequestsEnabled: () => Promise.resolve(mockListingFlag.current),
}));
jest.mock('../../lib/jobMedia', () => ({
  ...jest.requireActual('../../lib/jobMedia'),
  fetchJobMediaEnabled: () => Promise.resolve(mockMediaFlag.current),
  uploadJobPhotos: (...a: unknown[]) => mockUploadPhotos(...a),
}));
jest.mock('../../components/PhotoAttach', () => {
  const { Text } = require('react-native');
  return {
    PhotoAttach: ({ onChange }: { onChange: (u: string[]) => void }) => (
      <Text onPress={() => onChange(['file://a.jpg'])}>Add test photo</Text>
    ),
  };
});

jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));

jest.mock('../../lib/directRequests', () => ({
  ...jest.requireActual('../../lib/directRequests'),
  fetchDirectRequestFlags: () => Promise.resolve(mockFlags),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RequestWorkerScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockRpc.mockReset();
  mockFlags.enabled = true;
  mockFlags.quoteMarkup = false;
  mockParams.current = { workerId: 'worker-1', workerName: 'Usman', category: 'plumber' };
  mockListingFlag.current = true;
  mockMediaFlag.current = false;
  mockUploadPhotos.mockReset();
  mockAuth.current = { session: { user: { id: 'cust-1' } } };
});

describe('RequestWorkerScreen', () => {
  it('shows validation errors and does not call the server for an empty form', async () => {
    const { getByText, findByText } = wrap();
    fireEvent.press(getByText('Send request'));
    expect(await findByText('Enter a short title (at least 3 characters).')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('sends the request to the chosen worker without contact details', async () => {
    mockRpc.mockResolvedValue({ data: 'job-1', error: null });
    const { getByText, getAllByDisplayValue, UNSAFE_getAllByType } = wrap();
    const { TextInput } = require('react-native');
    const inputs = UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], 'Fix tap');
    fireEvent.changeText(inputs[1], 'Kitchen tap is leaking badly');
    fireEvent.changeText(inputs[2], '1,500');
    expect(getAllByDisplayValue('Fix tap')).toHaveLength(1);

    fireEvent.press(getByText('Send request'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    expect(mockRpc).toHaveBeenCalledWith('create_direct_request', {
      p_worker_id: 'worker-1',
      p_title: 'Fix tap',
      p_description: 'Kitchen tap is leaking badly',
      p_category: 'plumber',
      p_budget_pkr: 1500,
      p_preferred_time: null,
      p_location_text: null,
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Applications' }));
  });

  it('has no budget field when the quote commission markup is on, and never sends a budget', async () => {
    mockFlags.quoteMarkup = true;
    mockRpc.mockResolvedValue({ data: 'job-2', error: null });
    const { getByText, queryByText, findByText, UNSAFE_getAllByType } = wrap();
    const { TextInput } = require('react-native');
    await waitFor(() => expect(queryByText('Your budget in Rs (optional)')).toBeNull());
    const inputs = UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], 'Fix tap');
    fireEvent.changeText(inputs[1], 'Kitchen tap is leaking badly');
    fireEvent.press(getByText('Send request'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_budget_pkr: null });
    expect(await findByText('Send request')).toBeTruthy();
  });

  it('shows the server error and stays on the screen', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'daily request limit reached' } });
    const { getByText, findByText, UNSAFE_getAllByType } = wrap();
    const { TextInput } = require('react-native');
    const inputs = UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], 'Fix tap');
    fireEvent.changeText(inputs[1], 'Kitchen tap is leaking badly');
    fireEvent.press(getByText('Send request'));
    expect(await findByText('daily request limit reached')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('sends a guest to sign in instead of submitting', async () => {
    mockAuth.current = { session: null };
    const { getByText } = wrap();
    fireEvent.press(getByText('Send request'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Auth'));
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('RequestWorkerScreen from a listing', () => {
  beforeEach(() => {
    mockParams.current = { workerId: 'worker-1', workerName: 'Usman', category: 'plumber', listingId: 'listing-1' };
  });

  const fill = (u: ReturnType<typeof wrap>) => {
    const { TextInput } = require('react-native');
    const inputs = u.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], 'Fix tap');
    fireEvent.changeText(inputs[1], 'Kitchen tap is leaking badly');
    return inputs;
  };

  it('says it is a request for a quote and has no budget field', async () => {
    const u = wrap();
    expect(await u.findByText('Request a quote')).toBeTruthy();
    expect(u.queryByText(/budget/i)).toBeNull();
  });

  it('asks for the quote through the listing and never sends a budget', async () => {
    mockRpc.mockResolvedValue({ data: 'job-9', error: null });
    const u = wrap();
    fill(u);
    fireEvent.press(u.getByText('Send request'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('create_listing_request', {
      p_listing_id: 'listing-1',
      p_title: 'Fix tap',
      p_description: 'Kitchen tap is leaking badly',
      p_location_text: null,
      p_preferred_time: null,
    });
    expect(mockRpc).not.toHaveBeenCalledWith('create_direct_request', expect.anything());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Applications' }));
  });

  it('is blocked while quote requests from listings are off', async () => {
    mockListingFlag.current = false;
    const u = wrap();
    expect(await u.findByText(/not available/i)).toBeTruthy();
    fill(u);
    fireEvent.press(u.getByText('Send request'));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('attaches the photos to the new request when media is on', async () => {
    mockMediaFlag.current = true;
    mockRpc.mockResolvedValue({ data: 'job-9', error: null });
    mockUploadPhotos.mockResolvedValue({ failed: 0 });
    const u = wrap();
    fireEvent.press(await u.findByText('Add test photo'));
    fill(u);
    fireEvent.press(u.getByText('Send request'));
    await waitFor(() => expect(mockUploadPhotos).toHaveBeenCalledWith('cust-1', 'job-9', ['file://a.jpg']));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Applications' }));
  });

  it('shows the server error and does not leave the screen', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'daily request limit reached' } });
    const u = wrap();
    fill(u);
    fireEvent.press(u.getByText('Send request'));
    expect(await u.findByText('daily request limit reached')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
