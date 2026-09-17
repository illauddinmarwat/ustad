import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JobsScreen from './JobsScreen';

const mockNavigate = jest.fn();

const mockAuth: { current: { role: 'customer' | 'worker' | null; session: { user: { id: string } } | null } } = {
  current: { role: null, session: null },
};

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth.current,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

type AnonJobMock = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  location_text: string | null;
  worker_id: string | null;
  created_at: string;
  origin: string;
  posted_by_anon: boolean;
};

const mockInsert = jest.fn<Promise<{ data: unknown; error: unknown }>, [Record<string, unknown>]>();
mockInsert.mockResolvedValue({ data: null, error: null });
const mockSelectChain = {
  select: () => ({
    order: () => ({
      limit: () => Promise.resolve({ data: [], error: null }),
    }),
  }),
  insert: (payload: Record<string, unknown>) => mockInsert(payload),
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => mockSelectChain),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  },
}));

const mockAddAnonToken = jest.fn<Promise<void>, [string]>();
mockAddAnonToken.mockResolvedValue(undefined);
const mockFetchOwnAnonJobs = jest.fn<Promise<AnonJobMock[]>, []>();
mockFetchOwnAnonJobs.mockResolvedValue([]);

jest.mock('../../lib/anonJobs', () => ({
  addAnonToken: (token: string) => mockAddAnonToken(token),
  fetchOwnAnonJobs: () => mockFetchOwnAnonJobs(),
  generateAnonToken: () => 'tok-test-1',
}));

jest.mock('../../lib/analytics', () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
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
  mockInsert.mockClear();
  mockInsert.mockResolvedValue({ data: null, error: null });
  mockAddAnonToken.mockClear();
  mockFetchOwnAnonJobs.mockClear();
  mockFetchOwnAnonJobs.mockResolvedValue([]);
  mockAuth.current = { role: null, session: null };
});

describe('JobsScreen', () => {
  it('shows the post-job form and guest hint to unauthenticated users', async () => {
    const { findByText } = wrap(<JobsScreen />);
    expect(await findByText('Post a new job')).toBeTruthy();
    expect(
      await findByText(
        'Post a job without an account. Sign in later to chat with workers and accept quotes.',
      ),
    ).toBeTruthy();
  });

  it('inserts an anonymous job and stores its token (no Auth redirect)', async () => {
    const { findByText, getByPlaceholderText } = wrap(<JobsScreen />);
    await findByText('Post a new job');
    fireEvent.changeText(
      getByPlaceholderText('Need electrician for fan install'),
      'Fix the kitchen sink',
    );
    await act(async () => {
      fireEvent.press(await findByText('Post job'));
    });
    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    const payload = mockInsert.mock.calls[0][0];
    expect(payload.customer_id).toBeNull();
    expect(payload.posted_by_anon).toBe(true);
    expect(payload.anon_post_token).toBe('tok-test-1');
    expect(payload.title).toBe('Fix the kitchen sink');
    expect(mockAddAnonToken).toHaveBeenCalledWith('tok-test-1');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders previously-posted anonymous jobs returned by get_anon_job', async () => {
    mockFetchOwnAnonJobs.mockResolvedValueOnce([
      {
        id: 'job-1',
        title: 'AC service in DHA',
        description: null,
        category: 'general',
        status: 'open',
        location_text: null,
        worker_id: null,
        created_at: '2026-05-12T00:00:00Z',
        origin: 'customer_job',
        posted_by_anon: true,
      },
    ]);
    const { findByText } = wrap(<JobsScreen />);
    expect(await findByText('AC service in DHA')).toBeTruthy();
  });
});
