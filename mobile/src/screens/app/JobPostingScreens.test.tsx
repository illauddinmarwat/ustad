import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BoardJobScreen from './BoardJobScreen';
import PostedJobScreen from './PostedJobScreen';
import PostJobScreen from './PostJobScreen';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockAddGuestJob = jest.fn();
const mockRemoveGuestJob = jest.fn();
const mockParams: { current: Record<string, unknown> } = { current: {} };
const mockAuth: { current: { session: { user: { id: string } } | null; role: string | null } } = {
  current: { session: null, role: null },
};

jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../lib/jobPosting', () => ({
  ...jest.requireActual('../../lib/jobPosting'),
  fetchJobPostingEnabled: () => Promise.resolve(true),
  addGuestJob: (...a: unknown[]) => mockAddGuestJob(...a),
  removeGuestJob: (...a: unknown[]) => mockRemoveGuestJob(...a),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {node}
    </SafeAreaProvider>,
  );

beforeEach(() => {
  [mockNavigate, mockReplace, mockRpc, mockFrom, mockAddGuestJob, mockRemoveGuestJob].forEach((m) => m.mockReset());
  mockAuth.current = { session: null, role: null };
  mockParams.current = {};
});

const fillPost = (utils: ReturnType<typeof wrap>, description = 'The kitchen tap is leaking badly') => {
  const inputs = utils.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], 'Fix kitchen tap');
  fireEvent.changeText(inputs[1], description);
  fireEvent.press(utils.getByText('Plumber'));
};

describe('PostJobScreen', () => {
  it('validates before calling the server', async () => {
    const u = wrap(<PostJobScreen />);
    fireEvent.press(await u.findByText('Post job'));
    expect(await u.findByText('Choose a category.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('blocks phone numbers in the description', async () => {
    const u = wrap(<PostJobScreen />);
    fillPost(u, 'Tap is leaking, call 0300 1234567');
    fireEvent.press(await u.findByText('Post job'));
    expect((await u.findAllByText(/Do not include phone numbers or links/)).length).toBeGreaterThan(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('posts as a guest, remembers the token on the device, and opens the job', async () => {
    mockRpc.mockResolvedValue({ data: [{ job_id: 'j1', guest_token: 'tok-1' }], error: null });
    const u = wrap(<PostJobScreen />);
    fillPost(u);
    fireEvent.press(await u.findByText('Post job'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith(
        'post_job',
        expect.objectContaining({ p_title: 'Fix kitchen tap', p_category: 'plumber' }),
      ),
    );
    await waitFor(() =>
      expect(mockAddGuestJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'j1', token: 'tok-1' })),
    );
    expect(mockReplace).toHaveBeenCalledWith('PostedJob', { jobId: 'j1', token: 'tok-1' });
  });

  it('posts as a signed-in customer without a guest token', async () => {
    mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer' };
    mockRpc.mockResolvedValue({ data: [{ job_id: 'j2', guest_token: null }], error: null });
    const u = wrap(<PostJobScreen />);
    fillPost(u);
    fireEvent.press(await u.findByText('Post job'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('PostedJob', { jobId: 'j2' }));
    expect(mockAddGuestJob).not.toHaveBeenCalled();
  });

  it('shows the server error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'daily job limit reached' } });
    const u = wrap(<PostJobScreen />);
    fillPost(u);
    fireEvent.press(await u.findByText('Post job'));
    expect(await u.findByText('daily job limit reached')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

const guestJob = {
  id: 'j1',
  title: 'Fix kitchen tap',
  description: 'Leaking badly',
  category: 'plumber',
  status: 'quoted',
  city: null,
  location_text: null,
  budget_min_pkr: null,
  budget_max_pkr: null,
  preferred_time: null,
  expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  worker_id: null,
};
const quote = {
  quote_id: 'q1',
  worker_id: 'w1',
  worker_name: 'Usman',
  amount_pkr: 1800,
  message: 'Can do tomorrow',
  status: 'pending',
  created_at: new Date().toISOString(),
  avg_rating: 4.5,
  review_count: 10,
  is_verified: true,
  years_experience: 6,
};

describe('PostedJobScreen', () => {
  const rpcFor = (extra: Record<string, unknown> = {}) =>
    mockRpc.mockImplementation((name: string) => {
      if (name in extra) return Promise.resolve(extra[name]);
      if (name === 'get_guest_job') return Promise.resolve({ data: [guestJob] });
      if (name === 'job_quotes') return Promise.resolve({ data: [quote] });
      return Promise.resolve({ data: null, error: null });
    });
  const fromJob = () =>
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: guestJob }) }) }),
    });

  it('shows a guest their quotes and sends them to sign in when they accept', async () => {
    mockParams.current = { jobId: 'j1', token: 'tok-1' };
    rpcFor();
    const u = wrap(<PostedJobScreen />);
    expect(await u.findByText('Usman')).toBeTruthy();
    expect(u.getByText('Rs 1800')).toBeTruthy();
    fireEvent.press(u.getByText('Accept quote'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Auth'));
    expect(mockRpc).not.toHaveBeenCalledWith('customer_accept_quote', expect.anything());
  });

  it('attaches the guest job to the account once signed in, then loads it by id', async () => {
    mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer' };
    mockParams.current = { jobId: 'j1', token: 'tok-1' };
    rpcFor({ claim_guest_job: { data: 'j1', error: null } });
    fromJob();
    const u = wrap(<PostedJobScreen />);
    expect(await u.findByText('This job is now saved to your account.')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('claim_guest_job', { p_token: 'tok-1' });
    expect(mockRemoveGuestJob).toHaveBeenCalledWith('tok-1');
  });

  it('lets a signed-in customer accept a quote', async () => {
    mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer' };
    mockParams.current = { jobId: 'j1' };
    rpcFor({ customer_accept_quote: { error: null } });
    fromJob();
    const u = wrap(<PostedJobScreen />);
    fireEvent.press(await u.findByText('Accept quote'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('customer_accept_quote', { p_quote_id: 'q1' }));
  });
});

describe('BoardJobScreen', () => {
  const boardJob = {
    id: 'j9',
    title: 'Wire two rooms',
    description: 'New wiring for two bedrooms',
    category: 'electrician',
    city: 'Lahore',
    location_text: 'DHA',
    budget_min_pkr: 8000,
    budget_max_pkr: 12000,
    preferred_time: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000 * 3).toISOString(),
    status: 'open',
    quote_count: 2,
    my_quote_pkr: null,
  };
  const rpcBoard = () =>
    mockRpc.mockImplementation((name: string) =>
      name === 'get_board_job' ? Promise.resolve({ data: [boardJob] }) : Promise.resolve({ data: [], error: null }),
    );

  beforeEach(() => {
    mockAuth.current = { session: { user: { id: 'w1' } }, role: 'worker' };
    mockParams.current = { jobId: 'j9' };
  });

  it('shows full details and sends a quote', async () => {
    rpcBoard();
    const u = wrap(<BoardJobScreen />);
    expect(await u.findByText('New wiring for two bedrooms')).toBeTruthy();
    expect(u.getByText('Rs 8000 - 12000')).toBeTruthy();
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], '9500');
    fireEvent.press(u.getByText('Send quote'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('worker_quote_job', { p_job_id: 'j9', p_amount_pkr: 9500, p_message: null }),
    );
  });

  it('refuses a quote message that contains a phone number', async () => {
    rpcBoard();
    const u = wrap(<BoardJobScreen />);
    await u.findByText('New wiring for two bedrooms');
    const inputs = u.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], '9500');
    fireEvent.changeText(inputs[1], 'call me 0300 1234567');
    fireEvent.press(u.getByText('Send quote'));
    expect((await u.findAllByText(/do not share phone numbers or links/i)).length).toBeGreaterThan(0);
    expect(mockRpc).not.toHaveBeenCalledWith('worker_quote_job', expect.anything());
  });
});
