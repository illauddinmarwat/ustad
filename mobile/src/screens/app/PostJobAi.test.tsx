import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PostJobScreen from './PostJobScreen';

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
const mockReplace = jest.fn();
const mockRpc = jest.fn();
const mockTranslate = jest.fn();
const mockParams: { current: Record<string, unknown> | undefined } = { current: undefined };
const mockAi = { enabled: true };
const mockAuth: { current: { session: { user: { id: string } } | null; role: string | null; language: string } } = {
  current: { session: { user: { id: 'c1' } }, role: 'customer', language: 'en' },
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
  addGuestJob: jest.fn(),
}));
jest.mock('../../lib/jobMedia', () => ({
  ...jest.requireActual('../../lib/jobMedia'),
  fetchJobMediaEnabled: () => Promise.resolve(false),
}));
jest.mock('../../lib/aiDraft', () => ({
  ...jest.requireActual('../../lib/aiDraft'),
  fetchAiHelpEnabled: () => Promise.resolve(mockAi.enabled),
  translateFields: (...a: unknown[]) => mockTranslate(...a),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: jest.fn() },
}));

const UR_TITLE = 'کچن کے نل سے پانی ٹپک رہا ہے';
const UR_DESC = 'مکسر بند ہونے کے باوجود پانی ٹپکتا ہے۔';

const DRAFT = {
  source: 'en',
  category: 'plumber',
  title: 'Kitchen tap leaking',
  description: 'Water drips from the mixer even when closed.',
};

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <PostJobScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  [mockNavigate, mockReplace, mockRpc, mockTranslate].forEach((m) => m.mockReset());
  mockParams.current = undefined;
  mockAi.enabled = true;
  mockAuth.current = { session: { user: { id: 'c1' } }, role: 'customer', language: 'en' };
  mockRpc.mockResolvedValue({ data: [{ job_id: 'j1', guest_token: null }], error: null });
});

const toDetails = async (u: ReturnType<typeof wrap>) => {
  fireEvent.press(await u.findByText('Plumber'));
  fireEvent.press(u.getByText('Next'));
  await u.findByText('Job title');
};

const fillDetails = (u: ReturnType<typeof wrap>) => {
  const inputs = u.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], 'Kitchen tap leaking');
  fireEvent.changeText(inputs[1], 'Water drips from the mixer even when closed.');
};

describe('PostJobScreen: Help me write', () => {
  it('is not on step 1 but on the Describe step, and opens with the trades, the typed text and the media count', async () => {
    const u = wrap();
    await u.findByText('Plumber');
    expect(u.queryByText('Help me write')).toBeNull();
    await toDetails(u);
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[1], 'tap leaking');
    fireEvent.press(await u.findByText('Help me write'));
    expect(mockNavigate).toHaveBeenCalledWith('AiHelper', {
      mode: 'job',
      categories: expect.arrayContaining(['plumber', 'electrician']),
      startText: 'tap leaking',
      attached: { photos: 0, voice: false, video: false },
    });
  });

  it('offers it to a guest too', async () => {
    mockAuth.current = { session: null, role: null, language: 'en' };
    const u = wrap();
    await toDetails(u);
    expect(await u.findByText('Help me write')).toBeTruthy();
  });

  it('hides it while AI help is off and for an Ustad', async () => {
    mockAi.enabled = false;
    const off = wrap();
    await toDetails(off);
    expect(off.queryByText('Help me write')).toBeNull();
    off.unmount();
    mockAi.enabled = true;
    mockAuth.current = { session: { user: { id: 'w1' } }, role: 'worker', language: 'en' };
    const worker = wrap();
    await toDetails(worker);
    expect(worker.queryByText('Help me write')).toBeNull();
  });

  it('puts the draft in the fields on Describe, in the one language, and translates nothing yet', async () => {
    mockParams.current = { draft: DRAFT };
    const u = wrap();
    expect(await u.findByText('Step 2 of 3')).toBeTruthy();
    expect(u.getByDisplayValue('Kitchen tap leaking')).toBeTruthy();
    expect(u.getByDisplayValue('Water drips from the mixer even when closed.')).toBeTruthy();
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  it('translates once, when the author moves on to the review, and sends both languages', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { title: UR_TITLE, description: UR_DESC } });
    mockParams.current = { draft: DRAFT };
    const u = wrap();
    await u.findByText('Step 2 of 3');
    fireEvent.press(u.getByText('Next'));
    await u.findByText('I checked both versions');
    expect(mockTranslate).toHaveBeenCalledTimes(1);
    expect(mockTranslate).toHaveBeenCalledWith('job', 'en', {
      title: 'Kitchen tap leaking',
      description: 'Water drips from the mixer even when closed.',
    });
    fireEvent.press(u.getByText('Post job'));
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith(
      'post_job',
      expect.objectContaining({
        p_title: 'Kitchen tap leaking',
        p_category: 'plumber',
        p_title_i18n: { source: 'en', en: 'Kitchen tap leaking', ur: UR_TITLE, ai: true },
      }),
    );
  });

  it('stores the Urdu text as the original when the author wrote in Urdu', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { title: 'Kitchen tap leaking', description: 'Water drips.' } });
    mockParams.current = { draft: { ...DRAFT, source: 'ur', title: UR_TITLE, description: UR_DESC } };
    const u = wrap();
    await u.findByText('Step 2 of 3');
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('I checked both versions'));
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    const args = mockRpc.mock.calls[0][1];
    expect(args.p_title).toBe(UR_TITLE);
    expect(args.p_title_i18n.source).toBe('ur');
    expect(mockTranslate).toHaveBeenCalledWith('job', 'ur', expect.anything());
  });

  it('sends what the author edited after the draft, not the draft', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { title: UR_TITLE, description: UR_DESC } });
    mockParams.current = { draft: DRAFT };
    const u = wrap();
    await u.findByText('Step 2 of 3');
    fireEvent.changeText(u.getByDisplayValue('Kitchen tap leaking'), 'Kitchen mixer tap leaking');
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('I checked both versions'));
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc.mock.calls[0][1].p_title).toBe('Kitchen mixer tap leaking');
    expect(mockTranslate).toHaveBeenCalledWith('job', 'en', expect.objectContaining({ title: 'Kitchen mixer tap leaking' }));
  });

  it('sends the person back to step 1 when the draft had no matching category', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { title: UR_TITLE, description: UR_DESC } });
    mockParams.current = { draft: { ...DRAFT, category: null } };
    const u = wrap();
    await u.findByText('Step 2 of 3');
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('I checked both versions'));
    fireEvent.press(u.getByText('Post job'));
    expect(await u.findByText('Choose a category.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a phone number typed into a translation', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { title: UR_TITLE, description: UR_DESC } });
    mockParams.current = { draft: DRAFT };
    const u = wrap();
    await u.findByText('Step 2 of 3');
    fireEvent.press(u.getByText('Next'));
    await u.findByText('I checked both versions');
    fireEvent.changeText(u.getByDisplayValue(UR_DESC), 'فون ۰۳۰۰۱۲۳۴۵۶۷');
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Post job'));
    expect((await u.findAllByText(/remove phone numbers and links/i)).length).toBeGreaterThan(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('PostJobScreen: when the helper could not write a draft', () => {
  it('puts what the person typed into the description, so nothing is lost', async () => {
    mockParams.current = { prefill: { description: 'nal se pani tapak raha hai' } };
    const u = wrap();
    fireEvent.press(await u.findByText('Plumber'));
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Job title');
    expect(u.UNSAFE_getAllByType(TextInput)[1].props.value).toBe('nal se pani tapak raha hai');
  });
});

describe('PostJobScreen: English and Urdu for text the author wrote', () => {
  it('prepares the other language on the review and sends both', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { title: UR_TITLE, description: UR_DESC } });
    const u = wrap();
    await toDetails(u);
    fillDetails(u);
    fireEvent.press(u.getByText('Next'));
    await u.findByText('I checked both versions');
    expect(mockTranslate).toHaveBeenCalledWith('job', 'en', {
      title: 'Kitchen tap leaking',
      description: 'Water drips from the mixer even when closed.',
    });
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc.mock.calls[0][1].p_title_i18n).toEqual({ source: 'en', en: 'Kitchen tap leaking', ur: UR_TITLE, ai: true });
  });

  it('posts as written, with no translations, when the other language could not be prepared', async () => {
    mockTranslate.mockResolvedValue({ ok: false, error: 'limit' });
    const u = wrap();
    await toDetails(u);
    fillDetails(u);
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText(/used all of your AI help/)).toBeTruthy();
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    const args = mockRpc.mock.calls[0][1];
    expect(args.p_title_i18n).toBeNull();
    expect(args.p_description_i18n).toBeNull();
    expect(args.p_title).toBe('Kitchen tap leaking');
  });

  it('does not call the AI at all while AI help is off', async () => {
    mockAi.enabled = false;
    const u = wrap();
    await toDetails(u);
    fillDetails(u);
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Post job');
    fireEvent.press(u.getByText('Post job'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockTranslate).not.toHaveBeenCalled();
    expect(mockRpc.mock.calls[0][1].p_title_i18n).toBeNull();
  });
});
