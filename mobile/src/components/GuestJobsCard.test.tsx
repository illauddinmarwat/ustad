import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { GuestJobsCard } from './GuestJobsCard';

const mockNavigate = jest.fn();
const mockAuth: { current: { session: { user: { id: string } } | null } } = { current: { session: null } };

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('../lib/jobPosting', () => ({
  listGuestJobs: () => Promise.resolve([{ jobId: 'j1', token: 't1', title: 'Fix my tap', createdAt: '2026-10-04' }]),
}));
jest.mock('../lib/guestQuotes', () => ({ useGuestQuoteCount: () => ({ total: 2, byToken: { t1: 2 }, refresh: jest.fn() }) }));

describe('GuestJobsCard', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockAuth.current = { session: null };
  });

  it('tells a guest why to create an account, and how many quotes are waiting', async () => {
    const u = render(<GuestJobsCard />);
    expect(await u.findByText('Fix my tap')).toBeTruthy();
    expect(u.getByText('Get told when an Ustad quotes')).toBeTruthy();
    expect(u.getByText('2 quotes waiting')).toBeTruthy();
    fireEvent.press(u.getByText('Create a free account'));
    expect(mockNavigate).toHaveBeenCalledWith('Auth');
  });

  it('does not nudge someone who is signed in', async () => {
    mockAuth.current = { session: { user: { id: 'c1' } } };
    const u = render(<GuestJobsCard />);
    await waitFor(() => expect(u.getByText('Fix my tap')).toBeTruthy());
    expect(u.queryByText('Get told when an Ustad quotes')).toBeNull();
  });
});
