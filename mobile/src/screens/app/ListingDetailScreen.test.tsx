import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ListingDetailScreen from './ListingDetailScreen';

const mockNavigate = jest.fn();
const mockRequestsFlag = { current: true };
const mockPhotos: { current: Record<string, string[]> } = { current: {} };
const mockAreas: { current: Record<string, string[]> } = { current: {} };
const mockI18n: { current: { headline: unknown; detail: unknown } } = { current: { headline: null, detail: null } };
const mockAuth: { current: { role: string | null; session: { user: { id: string } } | null; language?: string } } = {
  current: { role: 'customer', session: { user: { id: 'c1' } } },
};

jest.mock('../../config/env', () => ({ useLiveDatabase: true }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../lib/phase4Flags', () => ({ fetchPhase4Flags: () => Promise.resolve({ webEnabled: false }) }));
jest.mock('../../lib/listings', () => ({
  fetchListingRequestsEnabled: () => Promise.resolve(mockRequestsFlag.current),
  loadListingPhotos: () => Promise.resolve(mockPhotos.current),
  loadListingExtras: () =>
    Promise.resolve(Object.fromEntries(Object.entries(mockAreas.current).map(([id, areas]) => [id, { areas, headlineI18n: mockI18n.current.headline, detailI18n: mockI18n.current.detail }]))),
}));
jest.mock('../../lib/supabase', () => {
  const listing = {
    id: 'l1',
    headline: 'Leak and tap repair',
    detail_text: 'Mixers, pipes and flush tanks.',
    price_pkr: 1500,
    worker_id: 'w1',
    template_id: 't1',
    status: 'active',
  };
  const single = (data: unknown) => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }) });
  return {
    supabase: {
      from: (table: string) => ({
        select: () =>
          table === 'worker_service_listings'
            ? single(listing)
            : table === 'service_templates'
              ? single({ title: 'Leak inspection & minor fix', category: 'plumbing' })
              : single({ display_name: 'Usman Khan' }),
      }),
      rpc: jest.fn(),
    },
  };
});

const navigation = { navigate: mockNavigate, setOptions: jest.fn() };
const route = { params: { listingId: 'l1' } };

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ListingDetailScreen {...({ navigation, route } as any)} />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockRequestsFlag.current = true;
  mockPhotos.current = {};
  mockAreas.current = {};
  mockI18n.current = { headline: null, detail: null };
  mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } } };
});

describe('ListingDetailScreen', () => {
  it('shows the listing and Ustad without any price', async () => {
    const u = wrap();
    expect(await u.findByText('Leak and tap repair')).toBeTruthy();
    expect(u.getByText('Usman Khan')).toBeTruthy();
    expect(u.queryByText(/Rs 1500|From Rs/)).toBeNull();
  });

  it('shows the areas the Ustad covers', async () => {
    mockAreas.current = { l1: ['Gulshan', 'North Nazimabad'] };
    const u = wrap();
    expect(await u.findByText('Gulshan')).toBeTruthy();
    expect(u.getByText('North Nazimabad')).toBeTruthy();
  });

  it('shows the photos of past work', async () => {
    mockPhotos.current = { l1: ['https://x/1.jpg', 'https://x/2.jpg'] };
    const u = wrap();
    await u.findByText('Leak and tap repair');
    const { Image } = require('react-native');
    const uris = u.UNSAFE_getAllByType(Image).map((i: { props: { source: { uri?: string } } }) => i.props.source?.uri);
    expect(uris).toEqual(expect.arrayContaining(['https://x/1.jpg', 'https://x/2.jpg']));
  });

  it('asks for a quote through the request screen, for this listing and Ustad', async () => {
    const u = wrap();
    fireEvent.press(await u.findByText('Request a quote'));
    expect(mockNavigate).toHaveBeenCalledWith('RequestWorker', {
      workerId: 'w1',
      workerName: 'Usman Khan',
      category: 'plumber',
      listingId: 'l1',
    });
  });

  it('keeps the old apply button while quote requests from listings are off', async () => {
    mockRequestsFlag.current = false;
    const u = wrap();
    expect(await u.findByText('Apply for service')).toBeTruthy();
    expect(u.queryByText('Request a quote')).toBeNull();
  });

  it('does not offer a quote request to an Ustad', async () => {
    mockAuth.current = { role: 'worker', session: { user: { id: 'w9' } } };
    const u = wrap();
    await u.findByText('Leak and tap repair');
    expect(u.queryByText('Request a quote')).toBeNull();
  });

  it('shows the headline and text in the reader language, with a way back to the original', async () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } }, language: 'ur' };
    mockAreas.current = { l1: [] };
    mockI18n.current = {
      headline: { source: 'en', en: 'Leak and tap repair', ur: 'نل اور لیکیج کی مرمت', ai: true },
      detail: { source: 'en', en: 'Mixers, pipes and flush tanks.', ur: 'مکسر، پائپ اور فلش ٹینک۔', ai: true },
    };
    const u = wrap();
    expect(await u.findByText('نل اور لیکیج کی مرمت')).toBeTruthy();
    expect(u.getByText('مکسر، پائپ اور فلش ٹینک۔')).toBeTruthy();
    fireEvent.press(u.getAllByText('Show original')[0]);
    expect(await u.findByText('Leak and tap repair')).toBeTruthy();
  });

  it('shows the original to a reader of the same language', async () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } }, language: 'en' };
    mockAreas.current = { l1: [] };
    mockI18n.current = {
      headline: { source: 'en', en: 'Leak and tap repair', ur: 'نل اور لیکیج کی مرمت', ai: true },
      detail: null,
    };
    const u = wrap();
    expect(await u.findByText('Leak and tap repair')).toBeTruthy();
    expect(u.queryByText('Show original')).toBeNull();
  });
});
