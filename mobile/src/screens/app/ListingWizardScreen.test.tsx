import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ListingWizardScreen from './ListingWizardScreen';

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockParams: { current: Record<string, unknown> | undefined } = { current: undefined };
const mockAi = { enabled: false };
const mockTranslate = jest.fn();
const mockInsert = jest.fn();
const mockUploadPhotos = jest.fn();
const mockTemplates = {
  current: [
    { id: 't-plumb', title: 'Leak inspection & minor fix', category: 'plumbing' },
    { id: 't-elec', title: 'Ceiling fan installation', category: 'electrical' },
  ],
};
const mockWorkerCategories: { current: string[] | null } = { current: ['plumber'] };
const mockAuth: {
  current: { session: { user: { id: string } } | null; role: string | null; workerApprovalStatus: string | null };
} = { current: { session: { user: { id: 'w1' } }, role: 'worker', workerApprovalStatus: 'approved' } };

jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('../../lib/aiDraft', () => ({
  ...jest.requireActual('../../lib/aiDraft'),
  fetchAiHelpEnabled: () => Promise.resolve(mockAi.enabled),
  translateFields: (...a: unknown[]) => mockTranslate(...a),
}));
jest.mock('../../components/PhotoAttach', () => {
  const { Text } = require('react-native');
  return {
    PhotoAttach: ({ onChange }: { onChange: (u: string[]) => void }) => (
      <Text onPress={() => onChange(['file://a.jpg'])}>Add test photo</Text>
    ),
  };
});
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
jest.mock('../../lib/listings', () => ({
  ...jest.requireActual('../../lib/listings'),
  uploadListingPhotos: (...a: unknown[]) => mockUploadPhotos(...a),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'service_templates') {
        return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: mockTemplates.current, error: null }) }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { city: 'Karachi' }, error: null }) }) }) };
      }
      if (table === 'worker_profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { categories: mockWorkerCategories.current }, error: null }) }),
          }),
        };
      }
      return { insert: (row: unknown) => ({ select: () => ({ single: () => mockInsert(row) }) }) };
    },
  },
}));

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ListingWizardScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  [mockReplace, mockNavigate, mockInsert, mockUploadPhotos, mockTranslate].forEach((m) => m.mockReset());
  mockParams.current = undefined;
  mockAi.enabled = false;
  mockInsert.mockResolvedValue({ data: { id: 'l1' }, error: null });
  mockUploadPhotos.mockResolvedValue({ failed: 0 });
  mockWorkerCategories.current = ['plumber'];
  mockAuth.current = { session: { user: { id: 'w1' } }, role: 'worker', workerApprovalStatus: 'approved' };
});

const toDetails = async (u: ReturnType<typeof wrap>) => {
  fireEvent.press(await u.findByText('Leak inspection & minor fix'));
  fireEvent.press(u.getByText('Next'));
  await u.findByText('Headline');
};

const fillDetails = (u: ReturnType<typeof wrap>, about = 'Mixers, pipes and flush tanks.') => {
  const inputs = u.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], 'Leak and tap repair');
  fireEvent.changeText(inputs[1], about);
};

const pickAreas = async (u: ReturnType<typeof wrap>) => {
  fireEvent.press(await u.findByText('Gulshan'));
  fireEvent.press(u.getByText('North Nazimabad'));
};

const toReview = async (u: ReturnType<typeof wrap>) => {
  await toDetails(u);
  fillDetails(u);
  await pickAreas(u);
  fireEvent.press(u.getByText('Next'));
  await u.findByText('Publish listing');
};

describe('ListingWizardScreen', () => {
  it('offers only the services in the Ustad trades', async () => {
    const u = wrap();
    expect(await u.findByText('Leak inspection & minor fix')).toBeTruthy();
    expect(u.queryByText('Ceiling fan installation')).toBeNull();
    expect(u.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('offers every service when the trades are not known', async () => {
    mockWorkerCategories.current = null;
    const u = wrap();
    expect(await u.findByText('Ceiling fan installation')).toBeTruthy();
  });

  it('suggests adding at least three photos', async () => {
    const u = wrap();
    expect(await u.findByText(/add at least 3 photos of finished jobs/)).toBeTruthy();
  });

  it('asks for a service before step 2', async () => {
    const u = wrap();
    await u.findByText('Leak inspection & minor fix');
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText('Choose the service you offer.')).toBeTruthy();
    expect(u.queryByText('Headline')).toBeNull();
  });

  it('asks for a headline and about text on step 2', async () => {
    const u = wrap();
    await toDetails(u);
    fireEvent.press(u.getByText('Next'));
    expect(await u.findByText(/Write a short headline/)).toBeTruthy();
    expect(u.queryByText('Publish listing')).toBeNull();
  });

  it('blocks a phone number in the text', async () => {
    const u = wrap();
    await toDetails(u);
    fillDetails(u, 'Call me on 0300 1234567');
    fireEvent.press(u.getByText('Next'));
    expect((await u.findAllByText(/Do not include phone numbers or links/)).length).toBeGreaterThan(0);
    expect(u.queryByText('Publish listing')).toBeNull();
  });

  it('shows no price field anywhere and says Ustads quote each request', async () => {
    const u = wrap();
    await toDetails(u);
    expect(u.queryByText(/Price \(PKR\)|From Rs/)).toBeNull();
    expect(u.getByText('No price here. You send a quote for each request.')).toBeTruthy();
  });

  it('reviews the listing, publishes it with its areas and no price, and returns to Services', async () => {
    const u = wrap();
    await toReview(u);
    expect(u.getByText('Step 3 of 3')).toBeTruthy();
    expect(u.getByText('Leak and tap repair')).toBeTruthy();
    expect(u.getByText('Gulshan')).toBeTruthy();
    fireEvent.press(u.getByText('Publish listing'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toEqual({
      worker_id: 'w1',
      template_id: 't-plumb',
      headline: 'Leak and tap repair',
      detail_text: 'Mixers, pipes and flush tanks.',
      service_areas: ['Gulshan', 'North Nazimabad'],
      headline_i18n: null,
      detail_i18n: null,
      status: 'active',
    });
    expect(row).not.toHaveProperty('price_pkr');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Services' }));
  });

  it('shows the server error and stays on the review step', async () => {
    mockInsert.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const u = wrap();
    await toReview(u);
    fireEvent.press(u.getByText('Publish listing'));
    expect(await u.findByText('permission denied')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not let a Ustad who is not approved publish', async () => {
    mockAuth.current = { session: { user: { id: 'w1' } }, role: 'worker', workerApprovalStatus: 'pending' };
    const u = wrap();
    await toReview(u);
    fireEvent.press(u.getByText('Publish listing'));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('uploads the chosen photos after publishing', async () => {
    const u = wrap();
    fireEvent.press(await u.findByText('Leak inspection & minor fix'));
    fireEvent.press(u.getByText('Add test photo'));
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fillDetails(u);
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('Publish listing'));
    await waitFor(() => expect(mockUploadPhotos).toHaveBeenCalledWith('w1', 'l1', ['file://a.jpg']));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Services' }));
  });

  it('tells the Ustad when some photos failed, and leaves on Done', async () => {
    mockUploadPhotos.mockResolvedValue({ failed: 1 });
    const u = wrap();
    fireEvent.press(await u.findByText('Leak inspection & minor fix'));
    fireEvent.press(u.getByText('Add test photo'));
    fireEvent.press(u.getByText('Next'));
    await u.findByText('Headline');
    fillDetails(u);
    fireEvent.press(u.getByText('Next'));
    fireEvent.press(await u.findByText('Publish listing'));
    expect(await u.findByText('Listing published, but some photos could not be uploaded.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.press(u.getByText('Done'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Services' }));
  });
});
