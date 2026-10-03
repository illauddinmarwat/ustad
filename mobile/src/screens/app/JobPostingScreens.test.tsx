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
const mockAuth: { current: { session: { user: { id: string } } | null; role: string | null; language?: string } } = {
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
const mockTypical: { current: unknown } = { current: null };
jest.mock('../../lib/typicalPrice', () => ({
  ...jest.requireActual('../../lib/typicalPrice'),
  fetchTypicalPrice: () => Promise.resolve(mockTypical.current),
}));
const mockAttachVoice = jest.fn();
jest.mock('../../lib/quoteVoice', () => ({
  QUOTE_VOICE_SECONDS: 30,
  attachQuoteVoice: (...a: unknown[]) => mockAttachVoice(...a),
  sendThreadVoice: jest.fn(),
  signedVoiceUrl: () => Promise.resolve('https://x/voice.m4a'),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('expo-audio');
const mockDetailed = { current: false };
jest.mock('../../lib/quoteDetails', () => ({
  ...jest.requireActual('../../lib/quoteDetails'),
  fetchQuoteUpgradesEnabled: () => Promise.resolve(mockDetailed.current),
}));
const mockMediaEnabled = { current: false };
jest.mock('../../lib/jobMedia', () => ({
  ...jest.requireActual('../../lib/jobMedia'),
  fetchJobMediaEnabled: () => Promise.resolve(mockMediaEnabled.current),
  loadJobMedia: () => Promise.resolve([]),
  loadMediaCounts: () => Promise.resolve({}),
  uploadJobPhotos: jest.fn(() => Promise.resolve({ failed: 0 })),
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
  mockMediaEnabled.current = false;
  mockDetailed.current = false;
  mockTypical.current = null;
  mockAttachVoice.mockReset();
  audio.__state.recorderMillis = 0;
  audio.__state.calls.length = 0;
});

const goToDetails = async (utils: ReturnType<typeof wrap>) => {
  fireEvent.press(await utils.findByText('Plumber'));
  fireEvent.press(utils.getByText('Next'));
  await utils.findByText('Job title');
};

const fillDetails = (utils: ReturnType<typeof wrap>, description = 'The kitchen tap is leaking badly') => {
  const inputs = utils.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], 'Fix kitchen tap');
  fireEvent.changeText(inputs[1], description);
};

/** Walk the wizard to the review step with a valid post. */
const goToReview = async (utils: ReturnType<typeof wrap>, description?: string) => {
  await goToDetails(utils);
  fillDetails(utils, description);
  fireEvent.press(utils.getByText('Next'));
  await utils.findByText('Post job');
};

describe('PostJobScreen', () => {
  it('starts on step 1 and asks for a category before moving on', async () => {
    const u = wrap(<PostJobScreen />);
    expect(await u.findByText('Step 1 of 3')).toBeTruthy();
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText('Choose a category.')).toBeTruthy();
    expect(u.queryByText('Job title')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('asks for a title and description on step 2', async () => {
    const u = wrap(<PostJobScreen />);
    await goToDetails(u);
    expect(u.getByText('Step 2 of 3')).toBeTruthy();
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText(/Describe the job/)).toBeTruthy();
    expect(u.queryByText('Post job')).toBeNull();
  });

  it('blocks phone numbers in the description', async () => {
    const u = wrap(<PostJobScreen />);
    await goToDetails(u);
    fillDetails(u, 'Tap is leaking, call 0300 1234567');
    fireEvent.press(u.getByText('Next'));
    expect((await u.findAllByText(/Do not include phone numbers or links/)).length).toBeGreaterThan(0);
    expect(u.queryByText('Post job')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the whole post on the review step and can go back to edit it', async () => {
    const u = wrap(<PostJobScreen />);
    await goToReview(u);
    expect(u.getByText('Step 3 of 3')).toBeTruthy();
    expect(u.getByText('Fix kitchen tap')).toBeTruthy();
    expect(u.getByText('The kitchen tap is leaking badly')).toBeTruthy();
    fireEvent.press(u.getByText('Back'));
    expect(await u.findByText('Job title')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('posts as a guest, remembers the token on the device, and opens the job', async () => {
    mockRpc.mockResolvedValue({ data: [{ job_id: 'j1', guest_token: 'tok-1' }], error: null });
    const u = wrap(<PostJobScreen />);
    await goToReview(u);
    fireEvent.press(u.getByText('Post job'));
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
    await goToReview(u);
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('PostedJob', { jobId: 'j2', mediaFailed: false }));
    expect(mockAddGuestJob).not.toHaveBeenCalled();
  });

  it('shows the photo picker to a signed-in customer when media is on, and never a budget field', async () => {
    mockMediaEnabled.current = true;
    mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer' };
    const u = wrap(<PostJobScreen />);
    expect(await u.findByText('Add photo')).toBeTruthy();
    expect(await u.findByText('Record voice note')).toBeTruthy();
    expect(await u.findByText('Record video')).toBeTruthy();
    expect(u.queryByText(/budget/i)).toBeNull();
  });

  it('tells a guest to sign in to add photos', async () => {
    mockMediaEnabled.current = true;
    const u = wrap(<PostJobScreen />);
    expect(await u.findByText('Sign in to add photos to your job.')).toBeTruthy();
    expect(u.queryByText('Add photo')).toBeNull();
    expect(u.queryByText('Record voice note')).toBeNull();
    expect(u.queryByText('Record video')).toBeNull();
  });

  it('hides the photo picker while the media flag is off', async () => {
    mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer' };
    const u = wrap(<PostJobScreen />);
    await u.findByText('Show the problem');
    expect(u.queryByText('Add photo')).toBeNull();
    expect(u.queryByText('Record voice note')).toBeNull();
  });

  it('shows the server error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'daily job limit reached' } });
    const u = wrap(<PostJobScreen />);
    await goToReview(u);
    fireEvent.press(u.getByText('Post job'));
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

  it('lets a guest go back to the home page after posting', async () => {
    mockParams.current = { jobId: 'j1', token: 'tok-1' };
    rpcFor();
    const u = wrap(<PostedJobScreen />);
    await u.findByText('Usman');
    fireEvent.press(u.getByText('Back to home'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Dashboard' });
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

  it('shows price type, start date and jobs done, and sorts the quotes', async () => {
    mockParams.current = { jobId: 'j1', token: 'tok-1' };
    const tomorrow = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    const cheap = { ...quote, quote_id: 'q2', worker_id: 'w2', worker_name: 'Zaid', amount_pkr: 1200, avg_rating: 3.9, price_type: 'fixed', available_from: null, completed_jobs: 0 };
    const rated = { ...quote, price_type: 'estimate', available_from: tomorrowStr, completed_jobs: 12 };
    rpcFor({ job_quotes: { data: [cheap, rated] } });
    const u = wrap(<PostedJobScreen />);
    await u.findByText('Usman');
    expect(u.getByText('Estimate')).toBeTruthy();
    expect(u.getByText('Can start: Tomorrow')).toBeTruthy();
    expect(u.getByText('12 jobs done')).toBeTruthy();
    const names = () => u.getAllByText(/^(Usman|Zaid)$/).map((n) => n.props.children);
    expect(names()).toEqual(['Zaid', 'Usman']);
    fireEvent.press(u.getByText('Best rated'));
    expect(names()).toEqual(['Usman', 'Zaid']);
  });

  it('plays a quote voice note for a signed-in customer and shows the typical price', async () => {
    mockDetailed.current = true;
    mockTypical.current = { scope: 'city', sampleSize: 12, low: 1000, median: 1500, high: 2000 };
    mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer' };
    mockParams.current = { jobId: 'j1' };
    const withVoice = { ...quote, audio_path: 'w1/j1/a.m4a', audio_seconds: 7 };
    rpcFor({ job_quotes: { data: [withVoice] } });
    fromJob();
    const u = wrap(<PostedJobScreen />);
    expect(await u.findByText('0:00 / 0:07')).toBeTruthy();
    expect(await u.findByText('Rs 1,000 - 2,000')).toBeTruthy();
    expect(u.getByText('Usually around Rs 1,500')).toBeTruthy();
  });

  it('does not try to play a voice note for a guest', async () => {
    mockDetailed.current = true;
    mockParams.current = { jobId: 'j1', token: 'tok-1' };
    rpcFor({ job_quotes: { data: [{ ...quote, audio_path: 'w1/j1/a.m4a', audio_seconds: 7 }] } });
    const u = wrap(<PostedJobScreen />);
    await u.findByText('Usman');
    expect(u.queryByText('0:00 / 0:07')).toBeNull();
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

  it('shows the post in the reader language and can show the original', async () => {
    mockAuth.current = { session: { user: { id: 'w1' } }, role: 'worker', language: 'ur' };
    mockRpc.mockImplementation((name: string) =>
      name === 'get_board_job'
        ? Promise.resolve({ data: [boardJob] })
        : name === 'job_translations'
          ? Promise.resolve({
              data: [
                {
                  job_id: 'j9',
                  title_i18n: { source: 'en', en: 'Wire two rooms', ur: 'دو کمروں کی وائرنگ', ai: true },
                  description_i18n: { source: 'en', en: 'New wiring for two bedrooms', ur: 'دو بیڈ رومز کی نئی وائرنگ', ai: true },
                },
              ],
              error: null,
            })
          : Promise.resolve({ data: [], error: null }),
    );
    const u = wrap(<BoardJobScreen />);
    expect(await u.findByText('دو کمروں کی وائرنگ')).toBeTruthy();
    expect(u.getByText('دو بیڈ رومز کی نئی وائرنگ')).toBeTruthy();
    fireEvent.press(u.getAllByText('Show original')[0]);
    expect(await u.findByText('Wire two rooms')).toBeTruthy();
  });

  it('asks for a start date and sends the price type when quote details are on', async () => {
    mockDetailed.current = true;
    rpcBoard();
    const u = wrap(<BoardJobScreen />);
    expect(await u.findByText('New wiring for two bedrooms')).toBeTruthy();
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], '9500');
    fireEvent.press(await u.findByText('Estimate'));
    fireEvent.press(u.getByText('Send quote'));
    expect(await u.findByText('Choose when you can start.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('worker_send_quote', expect.anything());
    fireEvent.press(u.getByText('Tomorrow'));
    fireEvent.press(u.getByText('Send quote'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith(
        'worker_send_quote',
        expect.objectContaining({ p_job_id: 'j9', p_amount_pkr: 9500, p_price_type: 'estimate', p_available_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      ),
    );
    expect(mockRpc).not.toHaveBeenCalledWith('worker_quote_job', expect.anything());
  });

  it('shows the typical price and a voice note recorder when quote details are on', async () => {
    mockDetailed.current = true;
    mockTypical.current = { scope: 'category', sampleSize: 20, low: 800, median: 1100, high: 1500 };
    rpcBoard();
    const u = wrap(<BoardJobScreen />);
    expect(await u.findByText('Rs 800 - 1,500')).toBeTruthy();
    expect(u.getAllByText('Record voice note').length).toBeGreaterThan(0);
  });

  it('hides the typical price and the recorder while quote details are off', async () => {
    mockTypical.current = { scope: 'category', sampleSize: 20, low: 800, median: 1100, high: 1500 };
    rpcBoard();
    const u = wrap(<BoardJobScreen />);
    await u.findByText('New wiring for two bedrooms');
    expect(u.queryByText('Rs 800 - 1,500')).toBeNull();
    expect(u.queryByText('Record voice note')).toBeNull();
  });

  it('sends the quote first and then attaches the voice note to it', async () => {
    mockDetailed.current = true;
    mockAttachVoice.mockResolvedValue(null);
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_job') return Promise.resolve({ data: [boardJob] });
      if (name === 'worker_send_quote') return Promise.resolve({ data: 'q9', error: null });
      return Promise.resolve({ data: [], error: null });
    });
    const u = wrap(<BoardJobScreen />);
    await u.findByText('New wiring for two bedrooms');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], '9500');
    await u.findAllByLabelText('Record voice note');
    fireEvent.press(u.getAllByLabelText('Record voice note')[0]);
    await waitFor(() => expect(audio.__state.calls).toContain('record'));
    audio.__state.recorderMillis = 9_000;
    fireEvent.press(await u.findByLabelText('Stop'));
    fireEvent.press(await u.findByText('Tomorrow'));
    fireEvent.press(u.getByText('Send quote'));
    await waitFor(() => expect(mockAttachVoice).toHaveBeenCalledWith('w1', 'j9', 'q9', { uri: 'file:///rec.m4a', seconds: 9 }));
  });

  it('says the quote was sent but the voice note failed to attach', async () => {
    mockDetailed.current = true;
    mockAttachVoice.mockResolvedValue('quote is not pending');
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_job') return Promise.resolve({ data: [boardJob] });
      if (name === 'worker_send_quote') return Promise.resolve({ data: 'q9', error: null });
      return Promise.resolve({ data: [], error: null });
    });
    const u = wrap(<BoardJobScreen />);
    await u.findByText('New wiring for two bedrooms');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], '9500');
    await u.findAllByLabelText('Record voice note');
    fireEvent.press(u.getAllByLabelText('Record voice note')[0]);
    await waitFor(() => expect(audio.__state.calls).toContain('record'));
    audio.__state.recorderMillis = 4_000;
    fireEvent.press(await u.findByLabelText('Stop'));
    fireEvent.press(await u.findByText('Tomorrow'));
    fireEvent.press(u.getByText('Send quote'));
    expect(await u.findByText(/quote was sent, but the voice note could not be attached/)).toBeTruthy();
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
