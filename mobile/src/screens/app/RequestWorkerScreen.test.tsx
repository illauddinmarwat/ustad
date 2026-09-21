import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RequestWorkerScreen from './RequestWorkerScreen';

const mockNavigate = jest.fn();
const mockRpc = jest.fn();
const mockFlags = { enabled: true };

const mockAuth: { current: { session: { user: { id: string } } | null } } = {
  current: { session: { user: { id: 'cust-1' } } },
};

jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { workerId: 'worker-1', workerName: 'Usman', category: 'plumber' } }),
}));

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
