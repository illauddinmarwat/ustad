import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ListingWizardScreen from './ListingWizardScreen';

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockInsert = jest.fn();
const mockTranslate = jest.fn();
const mockParams: { current: Record<string, unknown> | undefined } = { current: undefined };
const mockAi = { enabled: true };

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'w1' } }, role: 'worker', workerApprovalStatus: 'approved', language: 'en' }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../components/PhotoAttach', () => ({ PhotoAttach: () => null }));
jest.mock('../../lib/listings', () => ({
  ...jest.requireActual('../../lib/listings'),
  uploadListingPhotos: jest.fn(() => Promise.resolve({ failed: 0 })),
}));
jest.mock('../../lib/aiDraft', () => ({
  ...jest.requireActual('../../lib/aiDraft'),
  fetchAiHelpEnabled: () => Promise.resolve(mockAi.enabled),
  translateFields: (...a: unknown[]) => mockTranslate(...a),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'service_templates') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [{ id: 't1', title: 'Leak inspection & minor fix', category: 'plumbing' }], error: null }),
            }),
          }),
        };
      }
      if (table === 'worker_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { categories: ['plumber'] }, error: null }) }) }) };
      }
      return { insert: (row: unknown) => ({ select: () => ({ single: () => mockInsert(row) }) }) };
    },
  },
}));

const UR_HEAD = 'نل اور لیکیج کی مرمت';
const UR_ABOUT = 'مکسر، پائپ اور فلش ٹینک۔';

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ListingWizardScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  [mockReplace, mockNavigate, mockInsert, mockTranslate].forEach((m) => m.mockReset());
  mockInsert.mockResolvedValue({ data: { id: 'l1' }, error: null });
  mockParams.current = undefined;
  mockAi.enabled = true;
});

const toDetails = async (u: ReturnType<typeof wrap>) => {
  fireEvent.press(await u.findByText('Leak inspection & minor fix'));
  fireEvent.press(u.getByText('Next'));
  await u.findByText('Headline');
};

const fillDetails = (u: ReturnType<typeof wrap>) => {
  const inputs = u.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], 'Leak and tap repair');
  fireEvent.changeText(inputs[1], 'Mixers, pipes and flush tanks.');
};

const reviewWithTranslation = async (u: ReturnType<typeof wrap>) => {
  mockTranslate.mockResolvedValue({ ok: true, data: { headline: UR_HEAD, about: UR_ABOUT } });
  await toDetails(u);
  fillDetails(u);
  fireEvent.press(u.getByText('Next'));
  await u.findByText('I checked both versions');
};

describe('ListingWizardScreen: Help me write', () => {
  it('asks for a service before opening the helper, then opens it for that service', async () => {
    const u = wrap();
    fireEvent.press(await u.findByText('Help me write'));
    expect(await u.findByText('Choose the service you offer.')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.press(u.getByText('Leak inspection & minor fix'));
    fireEvent.press(u.getByText('Help me write'));
    expect(mockNavigate).toHaveBeenCalledWith('AiHelper', { mode: 'listing', serviceTitle: 'Leak inspection & minor fix' });
  });

  it('is not offered while AI help is off', async () => {
    mockAi.enabled = false;
    const u = wrap();
    await u.findByText('Leak inspection & minor fix');
    expect(u.queryByText('Help me write')).toBeNull();
  });

  it('takes the draft from the helper and lands on Details with the text filled', async () => {
    mockParams.current = {
      draft: {
        source: 'en',
        headline: { en: 'Leak and tap repair', ur: UR_HEAD },
        about: { en: 'Mixers, pipes and flush tanks.', ur: UR_ABOUT },
      },
    };
    const u = wrap();
    expect(await u.findByText('Step 2 of 3')).toBeTruthy();
    const inputs = u.UNSAFE_getAllByType(TextInput);
    expect(inputs[0].props.value).toBe('Leak and tap repair');
    expect(inputs[1].props.value).toBe('Mixers, pipes and flush tanks.');
    expect(mockTranslate).not.toHaveBeenCalled();
  });
});

describe('ListingWizardScreen: English and Urdu', () => {
  it('prepares the other language, shows both with the AI badge, and needs the tick before Publish', async () => {
    const u = wrap();
    await reviewWithTranslation(u);
    expect(mockTranslate).toHaveBeenCalledWith('listing', 'en', {
      headline: 'Leak and tap repair',
      about: 'Mixers, pipes and flush tanks.',
    });
    expect(u.getAllByText('AI draft')).toHaveLength(2);
    expect(u.getByDisplayValue(UR_HEAD)).toBeTruthy();
    fireEvent.press(u.getByText('Publish listing'));
    expect(mockInsert).not.toHaveBeenCalled();

    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Publish listing'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.headline).toBe('Leak and tap repair');
    expect(row.headline_i18n).toEqual({ source: 'en', en: 'Leak and tap repair', ur: UR_HEAD, ai: true });
    expect(row.detail_i18n).toEqual({ source: 'en', en: 'Mixers, pipes and flush tanks.', ur: UR_ABOUT, ai: true });
  });

  it('keeps an Urdu original as the stored text when the author wrote in Urdu', async () => {
    mockTranslate.mockResolvedValue({ ok: true, data: { headline: 'Leak and tap repair', about: 'Mixers and pipes.' } });
    const u = wrap();
    await toDetails(u);
    const inputs = u.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], UR_HEAD);
    fireEvent.changeText(inputs[1], UR_ABOUT);
    fireEvent.press(u.getByText('Next'));
    await u.findByText('I checked both versions');
    expect(mockTranslate).toHaveBeenCalledWith('listing', 'ur', { headline: UR_HEAD, about: UR_ABOUT });
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Publish listing'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.headline).toBe(UR_HEAD);
    expect(row.headline_i18n).toEqual({ source: 'ur', en: 'Leak and tap repair', ur: UR_HEAD, ai: true });
  });

  it('posts in the author language only when the other language could not be prepared', async () => {
    mockTranslate.mockResolvedValue({ ok: false, error: 'limit' });
    const u = wrap();
    await toDetails(u);
    fillDetails(u);
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText(/used all of your AI help/)).toBeTruthy();
    expect(u.getByText(/posted as you wrote it/)).toBeTruthy();
    fireEvent.press(u.getByText('Publish listing'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.headline_i18n).toBeNull();
    expect(row.detail_i18n).toBeNull();
  });

  it('marks the other language out of date after an edit, and updates it on request', async () => {
    const u = wrap();
    await reviewWithTranslation(u);
    mockTranslate.mockResolvedValue({ ok: true, data: { headline: 'نل اور لیکیج کی بہترین مرمت', about: UR_ABOUT } });
    fireEvent.changeText(u.getByDisplayValue('Leak and tap repair'), 'Best leak and tap repair');
    fireEvent.press(await u.findByText('Update translation'));
    await waitFor(() => expect(mockTranslate).toHaveBeenCalledTimes(2));
    expect(mockTranslate).toHaveBeenLastCalledWith('listing', 'en', expect.objectContaining({ headline: 'Best leak and tap repair' }));
    expect(await u.findByDisplayValue('نل اور لیکیج کی بہترین مرمت')).toBeTruthy();
    expect(u.queryByText('Update translation')).toBeNull();
  });

  it('needs the tick again after an edit', async () => {
    const u = wrap();
    await reviewWithTranslation(u);
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.changeText(u.getByDisplayValue('Leak and tap repair'), 'Leak repair');
    fireEvent.press(u.getByText('Publish listing'));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses a phone number typed into a translation', async () => {
    const u = wrap();
    await reviewWithTranslation(u);
    fireEvent.changeText(u.getByDisplayValue(UR_ABOUT), 'فون ۰۳۰۰۱۲۳۴۵۶۷');
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Publish listing'));
    expect((await u.findAllByText(/remove phone numbers and links/i)).length).toBeGreaterThan(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('keeps both versions when the original text is edited on Details, and marks the other one out of date', async () => {
    const u = wrap();
    await reviewWithTranslation(u);
    fireEvent.press(u.getByText('Back'));
    await u.findByText('Headline');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], 'Leak repair at home');
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText('Update translation')).toBeTruthy();
    expect(u.getByDisplayValue('Leak repair at home')).toBeTruthy();
    expect(u.getByDisplayValue(UR_HEAD)).toBeTruthy();
    expect(mockTranslate).toHaveBeenCalledTimes(1);
  });
});
