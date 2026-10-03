import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Switch, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ListingWizardScreen from './ListingWizardScreen';

const mockReplace = jest.fn();
const mockUpdate = jest.fn();
const mockRemovePhoto = jest.fn();
const mockUploadPhotos = jest.fn();
const mockTranslate = jest.fn();
const mockSetOptions = jest.fn();
const mockParams: { current: Record<string, unknown> } = { current: { listingId: 'l1' } };
const mockRow: { current: Record<string, unknown> | null } = { current: null };
const mockAi = { enabled: false };

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'w1' } }, role: 'worker', workerApprovalStatus: 'approved', language: 'en' }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, navigate: jest.fn(), goBack: jest.fn(), setOptions: mockSetOptions }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('../../lib/locations', () => ({
  useCities: () => ({ items: [{ id: 'c1', name: 'Karachi' }], loading: false, failed: false, reload: jest.fn() }),
  useAreas: (cityId: string | null) => ({
    items: cityId
      ? [
          { id: 'a1', name: 'Gulshan' },
          { id: 'a2', name: 'North Nazimabad' },
          { id: 'a3', name: 'DHA' },
        ]
      : [],
    loading: false,
    failed: false,
    reload: jest.fn(),
  }),
}));
jest.mock('../../lib/myLocation', () => ({ getMyLocation: () => Promise.resolve(null) }));
jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../components/PhotoAttach', () => {
  const { Text } = require('react-native');
  return {
    PhotoAttach: ({ onChange }: { onChange: (u: string[]) => void }) => <Text onPress={() => onChange(['file://new.jpg'])}>Add test photo</Text>,
  };
});
jest.mock('../../lib/listings', () => ({
  ...jest.requireActual('../../lib/listings'),
  loadOwnListingPhotos: () =>
    Promise.resolve([
      { id: 'p1', url: 'https://x/1.jpg' },
      { id: 'p2', url: 'https://x/2.jpg' },
    ]),
  removeListingPhoto: (...a: unknown[]) => mockRemovePhoto(...a),
  uploadListingPhotos: (...a: unknown[]) => mockUploadPhotos(...a),
}));
jest.mock('../../lib/aiDraft', () => ({
  ...jest.requireActual('../../lib/aiDraft'),
  fetchAiHelpEnabled: () => Promise.resolve(mockAi.enabled),
  translateFields: (...a: unknown[]) => mockTranslate(...a),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'worker_service_listings') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockRow.current, error: null }) }) }) }),
          update: (row: unknown) => ({ eq: () => mockUpdate(row) }),
        };
      }
      if (table === 'service_templates') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { title: 'Leak inspection & minor fix' }, error: null }),
              limit: () => Promise.resolve({ data: [{ id: 't1', title: 'Leak inspection & minor fix', category: 'plumbing' }], error: null }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { city: 'Karachi' }, error: null }) }) }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { categories: ['plumber'] }, error: null }) }) }) };
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

const oldListing = {
  id: 'l1',
  template_id: 't1',
  headline: 'Leak and tap repair',
  detail_text: 'Mixers, pipes and flush tanks.',
  service_areas: ['Gulshan', 'DHA'],
  status: 'active',
  headline_i18n: null,
  detail_i18n: null,
};

beforeEach(() => {
  [mockReplace, mockUpdate, mockRemovePhoto, mockUploadPhotos, mockTranslate, mockSetOptions].forEach((m) => m.mockReset());
  mockUpdate.mockResolvedValue({ error: null });
  mockRemovePhoto.mockResolvedValue(undefined);
  mockUploadPhotos.mockResolvedValue({ failed: 0 });
  mockParams.current = { listingId: 'l1' };
  mockRow.current = { ...oldListing };
  mockAi.enabled = false;
});

const toReview = async (u: ReturnType<typeof wrap>) => {
  await u.findByText('Step 1 of 3');
  fireEvent.press(u.getByText('Next'));
  await u.findByText('Headline');
  fireEvent.press(u.getByText('Next'));
  await u.findByText('Save changes');
};

describe('ListingWizardScreen: editing a service', () => {
  it('opens the saved service with its text, areas and photos, and cannot change the service type', async () => {
    const u = wrap();
    expect(await u.findByText('Leak inspection & minor fix')).toBeTruthy();
    expect(u.getByText('The service type cannot be changed.')).toBeTruthy();
    expect(u.getByText('Current photos')).toBeTruthy();
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    const inputs = u.UNSAFE_getAllByType(TextInput);
    expect(inputs[0].props.value).toBe('Leak and tap repair');
    expect(inputs[1].props.value).toBe('Mixers, pipes and flush tanks.');
    expect(u.getAllByText('Gulshan').length).toBeGreaterThan(0);
    expect(u.getAllByText('DHA').length).toBeGreaterThan(0);
    expect(u.getByText('Your areas (2/10)')).toBeTruthy();
    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Edit service' });
  });

  it('says so when the service is not found', async () => {
    mockRow.current = null;
    const u = wrap();
    expect(await u.findByText('This service was not found.')).toBeTruthy();
  });

  it('saves changed text and areas as an update, never an insert, and returns to Services', async () => {
    const u = wrap();
    await u.findByText('Step 1 of 3');
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], 'Leak and tap repair at home');
    fireEvent.press(u.getByLabelText('Remove DHA'));
    fireEvent.press(await u.findByText('North Nazimabad'));
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Save changes');
    fireEvent.press(u.getByText('Save changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0]).toEqual({
      headline: 'Leak and tap repair at home',
      detail_text: 'Mixers, pipes and flush tanks.',
      service_areas: ['Gulshan', 'North Nazimabad'],
      headline_i18n: null,
      detail_i18n: null,
      status: 'active',
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Services' }));
  });

  it('pauses a service with the visibility switch', async () => {
    const u = wrap();
    await u.findByText('Step 1 of 3');
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fireEvent(u.UNSAFE_getByType(Switch), 'valueChange', false);
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Save changes');
    expect(u.getByText('Paused')).toBeTruthy();
    fireEvent.press(u.getByText('Save changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].status).toBe('paused');
  });

  it('removes a current photo and uploads a new one on save', async () => {
    const u = wrap();
    await u.findByText('Current photos');
    fireEvent.press(u.getAllByLabelText('Remove')[0]);
    fireEvent.press(u.getByText('Add test photo'));
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('Save changes'));
    await waitFor(() => expect(mockRemovePhoto).toHaveBeenCalledWith('p1'));
    expect(mockRemovePhoto).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockUploadPhotos).toHaveBeenCalledWith('w1', 'l1', ['file://new.jpg']));
  });

  it('tells the Ustad when a photo change failed and leaves on Done', async () => {
    mockRemovePhoto.mockRejectedValue(new Error('nope'));
    const u = wrap();
    await u.findByText('Current photos');
    fireEvent.press(u.getAllByLabelText('Remove')[0]);
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('Save changes'));
    expect(await u.findByText('Listing published, but some photos could not be uploaded.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.press(u.getByText('Done'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Services' }));
  });

  it('shows the update error and stays on the review', async () => {
    mockUpdate.mockResolvedValue({ error: { message: 'permission denied' } });
    const u = wrap();
    await toReview(u);
    fireEvent.press(u.getByText('Save changes'));
    expect(await u.findByText('permission denied')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('ListingWizardScreen: adding a translation to an existing service', () => {
  it('lets the Ustad type the other language by hand when AI help is off', async () => {
    const u = wrap();
    await toReview(u);
    expect(u.queryByText('I checked both versions')).toBeNull();
    fireEvent.press(u.getByText('Add the other language myself'));
    expect(await u.findByText('I checked both versions')).toBeTruthy();
    expect(u.queryByText('AI draft')).toBeNull();
    expect(mockTranslate).not.toHaveBeenCalled();

    // Blank Urdu fields: saving is refused until they are filled in.
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Save changes'));
    expect(await u.findByText('Fill in both versions, or choose one language only.')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();

    const inputs = u.UNSAFE_getAllByType(TextInput);
    // English card: headline, about. Urdu card: headline, about.
    fireEvent.changeText(inputs[2], UR_HEAD);
    fireEvent.changeText(inputs[3], UR_ABOUT);
    fireEvent.press(u.getByText('I checked both versions'));
    fireEvent.press(u.getByText('Save changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const row = mockUpdate.mock.calls[0][0];
    expect(row.headline_i18n).toEqual({ source: 'en', en: 'Leak and tap repair', ur: UR_HEAD, ai: false });
    expect(row.detail_i18n).toEqual({ source: 'en', en: 'Mixers, pipes and flush tanks.', ur: UR_ABOUT, ai: false });
    expect(row.headline).toBe('Leak and tap repair');
  });

  it('can go back to one language only', async () => {
    const u = wrap();
    await toReview(u);
    fireEvent.press(u.getByText('Add the other language myself'));
    await u.findByText('I checked both versions');
    fireEvent.press(u.getByText('Use one language only'));
    expect(u.queryByText('I checked both versions')).toBeNull();
    fireEvent.press(u.getByText('Save changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].headline_i18n).toBeNull();
  });

  it('opens a service that already has both languages without asking the AI', async () => {
    mockAi.enabled = true;
    mockRow.current = {
      ...oldListing,
      headline_i18n: { source: 'en', en: 'Leak and tap repair', ur: UR_HEAD, ai: true },
      detail_i18n: { source: 'en', en: 'Mixers, pipes and flush tanks.', ur: UR_ABOUT, ai: true },
    };
    const u = wrap();
    await toReview(u);
    expect(u.getByDisplayValue(UR_HEAD)).toBeTruthy();
    expect(u.getAllByText('AI draft')).toHaveLength(2);
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  it('marks the saved Urdu out of date when the English text is edited, and keeps it until updated', async () => {
    mockRow.current = {
      ...oldListing,
      headline_i18n: { source: 'en', en: 'Leak and tap repair', ur: UR_HEAD, ai: false },
      detail_i18n: { source: 'en', en: 'Mixers, pipes and flush tanks.', ur: UR_ABOUT, ai: false },
    };
    const u = wrap();
    await u.findByText('Step 1 of 3');
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], 'Leak and tap repair at home');
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText('You changed this version. The other one may be out of date.')).toBeTruthy();
    expect(u.getByDisplayValue(UR_HEAD)).toBeTruthy();
  });

  it('uses AI to prepare the missing language when AI help is on', async () => {
    mockAi.enabled = true;
    mockTranslate.mockResolvedValue({ ok: true, data: { headline: UR_HEAD, about: UR_ABOUT } });
    const u = wrap();
    await toReview(u);
    await u.findByText('I checked both versions');
    expect(mockTranslate).toHaveBeenCalledWith('listing', 'en', { headline: 'Leak and tap repair', about: 'Mixers, pipes and flush tanks.' });
    expect(u.getAllByText('AI draft')).toHaveLength(2);
  });
});
