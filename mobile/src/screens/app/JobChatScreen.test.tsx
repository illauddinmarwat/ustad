import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import JobChatScreen from './JobChatScreen';

const mockRpc = jest.fn();
const mockReplace = jest.fn();
const mockRoute: { current: { params: Record<string, unknown> } } = { current: { params: { jobId: 'j1' } } };
const mockUid = { current: 'c1' };
let mockJobRow: unknown = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, navigate: jest.fn() }),
  useRoute: () => mockRoute.current,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: mockUid.current } } }) }));
jest.mock('../../lib/notifications', () => ({
  fetchNotifications: () => Promise.resolve([]),
  markNotificationsRead: jest.fn(),
}));
jest.mock('../../components/JobThread', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { JobThread: (p: { workerId: string; viewer: string }) => <Text>{`thread:${p.viewer}:${p.workerId}`}</Text> };
});
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockJobRow }) }) }) }),
  },
}));

const quotes = [
  { quote_id: 'q1', worker_id: 'w1', worker_name: 'Ali', amount_pkr: 1000 },
  { quote_id: 'q2', worker_id: 'w2', worker_name: 'Bilal', amount_pkr: 1200 },
];

beforeEach(() => {
  mockRpc.mockReset();
  mockReplace.mockReset();
  mockRoute.current = { params: { jobId: 'j1' } };
});

describe('JobChatScreen', () => {
  it('opens the customer chat with the Ustad who wrote last when a notification names no one', async () => {
    mockUid.current = 'c1';
    mockJobRow = { title: 'Fix tap', status: 'quoted', customer_id: 'c1', worker_id: null };
    mockRpc.mockImplementation((name: string, args: { p_worker_id?: string }) => {
      if (name === 'job_quotes') return Promise.resolve({ data: quotes });
      if (name === 'list_thread') {
        return Promise.resolve({ data: args.p_worker_id === 'w2' ? [{ created_at: '2026-10-02T10:00:00Z' }] : [{ created_at: '2026-10-01T10:00:00Z' }] });
      }
      return Promise.resolve({ data: null });
    });
    const u = render(<JobChatScreen />);
    expect(await u.findByText('thread:customer:w2')).toBeTruthy();
    expect(u.getByText('Fix tap')).toBeTruthy();
  });

  it('opens the Ustad chat for a worker who cannot read the job row', async () => {
    mockUid.current = 'w1';
    mockJobRow = null;
    mockRpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'get_board_job' ? { data: [{ title: 'Fix tap', my_quote_pkr: 900 }] } : { data: null }),
    );
    const u = render(<JobChatScreen />);
    expect(await u.findByText('thread:worker:w1')).toBeTruthy();
    expect(u.getByText('Rs 900')).toBeTruthy();
  });

  it('shows a closed message instead of hanging when the worker cannot see the job any more', async () => {
    mockUid.current = 'w1';
    mockJobRow = null;
    mockRpc.mockResolvedValue({ data: [] });
    const u = render(<JobChatScreen />);
    expect(await u.findByText(/no longer open/)).toBeTruthy();
  });

  it('hands over to the job page once the job is assigned', async () => {
    mockUid.current = 'w1';
    mockJobRow = { title: 'Fix tap', status: 'assigned', customer_id: 'c1', worker_id: 'w1' };
    mockRpc.mockResolvedValue({ data: null });
    render(<JobChatScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('JobDetail', { jobId: 'j1' }));
  });
});
