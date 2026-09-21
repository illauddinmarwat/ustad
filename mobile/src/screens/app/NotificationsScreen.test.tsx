import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NotificationsScreen from './NotificationsScreen';

const mockNavigate = jest.fn();
const mockFetch = jest.fn();
const mockMarkRead = jest.fn();

jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../lib/notifications', () => ({
  fetchNotifications: (...a: unknown[]) => mockFetch(...a),
  markNotificationsRead: (...a: unknown[]) => mockMarkRead(...a),
}));

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <NotificationsScreen />
    </SafeAreaProvider>,
  );

const row = (over: Record<string, unknown>) => ({
  id: 'n1',
  kind: 'job_closed',
  job_id: 'j1',
  title: 'Job closed',
  body: 'Payment confirmed: Fix tap',
  read_at: null,
  created_at: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockFetch.mockReset();
  mockMarkRead.mockReset().mockResolvedValue(undefined);
});

describe('NotificationsScreen', () => {
  it('shows an empty state', async () => {
    mockFetch.mockResolvedValue([]);
    const { findByText } = wrap();
    expect(await findByText('No notifications yet.')).toBeTruthy();
  });

  it('marks a notification read and opens its job on tap', async () => {
    mockFetch.mockResolvedValue([row({})]);
    const { findByText } = wrap();
    fireEvent.press(await findByText('Job closed'));
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(['n1']));
    expect(mockNavigate).toHaveBeenCalledWith('JobDetail', { jobId: 'j1' });
  });

  it('sends job-less notifications to the Applications tab and can mark all read', async () => {
    mockFetch.mockResolvedValue([row({ id: 'n2', kind: 'application_received', job_id: null, title: 'New application' })]);
    const { findByText, getByText } = wrap();
    fireEvent.press(await findByText('Mark all as read'));
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith());
    fireEvent.press(getByText('New application'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Applications' }));
  });
});
