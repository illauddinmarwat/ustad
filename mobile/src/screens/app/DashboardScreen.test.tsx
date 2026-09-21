import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from './DashboardScreen';

const mockNavigate = jest.fn();

const mockAuth: { current: { role: 'customer' | 'worker' | null; session: { user: { id: string } } | null } } = {
  current: { role: 'customer', session: null },
};

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth.current,
}));

const mockPosting = { current: false };
const mockUnread = { current: 0 };

jest.mock('../../lib/jobPosting', () => ({
  fetchJobPostingEnabled: () => Promise.resolve(mockPosting.current),
  listGuestJobs: () => Promise.resolve([]),
}));

jest.mock('../../lib/useUnreadNotifications', () => ({
  useUnreadNotifications: () => ({ count: mockUnread.current, refresh: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {node}
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockUnread.current = 0;
  mockPosting.current = false;
  mockAuth.current = { role: 'customer', session: null };
});

describe('DashboardScreen', () => {
  it('renders the bilingual brand header and categories', () => {
    const { getByText } = wrap(<DashboardScreen />);
    expect(getByText('Ustad')).toBeTruthy();
    expect(getByText('استاد')).toBeTruthy();
    expect(getByText('Your skill, your livelihood')).toBeTruthy();
    expect(getByText('Popular categories')).toBeTruthy();
    expect(getByText('Electrician')).toBeTruthy();
    expect(getByText('Welder')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const tree = wrap(<DashboardScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('routes the guest "Register as Professional" CTA to the professional registration form', () => {
    mockAuth.current = { role: null, session: null };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Register as Professional'));
    expect(mockNavigate).toHaveBeenCalledWith('RegisterProfessional');
  });

  it('routes the guest "Register as Customer" CTA to the customer registration form', () => {
    mockAuth.current = { role: null, session: null };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Register as Customer'));
    expect(mockNavigate).toHaveBeenCalledWith('RegisterCustomer');
  });

  it('routes the signed-in customer "Browse services" CTA to the Services tab', () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'u1' } } };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Browse services'));
    expect(mockNavigate).toHaveBeenCalledWith('Services');
  });

  it('routes the signed-in customer "Find nearby Ustads" CTA to the Nearby tab', () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'u1' } } };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Find nearby Ustads'));
    expect(mockNavigate).toHaveBeenCalledWith('Nearby');
  });

  it('opens Nearby filtered to the tapped category tile', () => {
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Electrician'));
    expect(mockNavigate).toHaveBeenCalledWith('Nearby', { category: 'electrician' });
  });

  it('shows the notification bell with the unread count for a signed-in user and opens the inbox', () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'u1' } } };
    mockUnread.current = 3;
    const { getByLabelText, getByText } = wrap(<DashboardScreen />);
    expect(getByText('3')).toBeTruthy();
    fireEvent.press(getByLabelText('Notifications'));
    expect(mockNavigate).toHaveBeenCalledWith('Notifications');
  });

  it('hides the bell from guests', () => {
    mockAuth.current = { role: null, session: null };
    const { queryByLabelText } = wrap(<DashboardScreen />);
    expect(queryByLabelText('Notifications')).toBeNull();
  });

  it('offers "Post a job" to guests and customers when job posting is on', async () => {
    mockPosting.current = true;
    const { findByText } = wrap(<DashboardScreen />);
    fireEvent.press(await findByText('Post a job'));
    expect(mockNavigate).toHaveBeenCalledWith('PostJob');
  });

  it('hides "Post a job" while job posting is off', () => {
    const { queryByText } = wrap(<DashboardScreen />);
    expect(queryByText('Post a job')).toBeNull();
  });

  it('offers the job board to workers when job posting is on', async () => {
    mockPosting.current = true;
    mockAuth.current = { role: 'worker', session: { user: { id: 'w1' } } };
    const { findByText } = wrap(<DashboardScreen />);
    fireEvent.press(await findByText('Job board'));
    expect(mockNavigate).toHaveBeenCalledWith('JobBoard');
  });
});
