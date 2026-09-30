import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CustomerHomeScreen from './CustomerHomeScreen';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockNavigate = jest.fn();
const mockAuth: { current: { session: { user: { id: string } } | null } } = { current: { session: null } };

jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('../../lib/jobPosting', () => ({
  fetchJobPostingEnabled: () => Promise.resolve(false),
  listGuestJobs: () => Promise.resolve([]),
}));
jest.mock('../../lib/useUnreadNotifications', () => ({ useUnreadNotifications: () => ({ count: 2, refresh: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {node}
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockAuth.current = { session: null };
});

describe('CustomerHomeScreen', () => {
  it('leads with the greeting, search and categories', () => {
    const { getByText } = wrap(<CustomerHomeScreen />);
    expect(getByText('What do you need fixed today?')).toBeTruthy();
    expect(getByText('Popular categories')).toBeTruthy();
    expect(getByText('Electrician')).toBeTruthy();
  });

  it('search opens Services and the nearby card opens Nearby', () => {
    const { getByText } = wrap(<CustomerHomeScreen />);
    fireEvent.press(getByText('Search plumber, electrician, AC…'));
    expect(mockNavigate).toHaveBeenCalledWith('Services');
    fireEvent.press(getByText('Ustads near you'));
    expect(mockNavigate).toHaveBeenCalledWith('Nearby');
  });

  it('shows register buttons to guests only', () => {
    const guest = wrap(<CustomerHomeScreen />);
    expect(guest.getByText('Register as Customer')).toBeTruthy();
    guest.unmount();
    mockAuth.current = { session: { user: { id: 'u1' } } };
    const signedIn = wrap(<CustomerHomeScreen />);
    expect(signedIn.queryByText('Register as Customer')).toBeNull();
    expect(signedIn.getByText('2')).toBeTruthy();
  });
});
