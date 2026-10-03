import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ServicesScreen from './ServicesScreen';

const mockNavigate = jest.fn();

const mockAuth: {
  current: {
    role: 'customer' | 'worker' | null;
    session: { user: { id: string; email?: string } } | null;
    workerApprovalStatus?: 'approved' | 'pending' | null;
    language?: 'en' | 'ur';
  };
} = {
  current: { role: null, session: null },
};

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth.current,
}));

const mockRouteParams: { current: { category?: string } | undefined } = { current: undefined };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams.current }),
}));

const mockListingRow = {
  id: 'listing-1',
  headline: 'AC service — DHA',
  price_pkr: 3500,
  status: 'active',
  worker_id: 'worker-1',
  template_id: 'template-1',
  created_at: new Date().toISOString(),
};

const mockListingCalls: Array<{ templateIds?: string[] }> = [];
const mockTemplates: { current: Array<{ id: string }> } = { current: [{ id: 'template-1' }] };

jest.mock('../../lib/supabase', () => {
  const listingRow = {
    id: 'listing-1',
    headline: 'AC service — DHA',
    price_pkr: 3500,
    status: 'active',
    worker_id: 'worker-1',
    template_id: 'template-1',
    created_at: new Date().toISOString(),
  };
  const buildChain = (table: string) => {
    if (table === 'worker_service_listings') {
      const ordered = (templateIds?: string[]) => ({
        order: () => ({
          limit: () => {
            mockListingCalls.push({ templateIds });
            return Promise.resolve({ data: templateIds && templateIds.length === 0 ? [] : [listingRow], error: null });
          },
        }),
      });
      return {
        select: () => ({
          eq: () => ({ ...ordered(), in: (_col: string, ids: string[]) => ordered(ids) }),
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    }
    if (table === 'service_templates') {
      return {
        select: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
            eq: () => Promise.resolve({ data: mockTemplates.current, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
  };
  return {
    supabase: {
      from: jest.fn((table: string) => buildChain(table)),
      rpc: jest.fn(() => Promise.resolve({ data: null, error: new Error('rpc disabled in test') })),
    },
  };
});

const mockAreas: { current: Record<string, string[]> } = { current: {} };
const mockHeadlineI18n: { current: unknown } = { current: null };
const mockPhotos: { current: Record<string, string[]> } = { current: {} };
const mockCards: { current: Record<string, unknown> } = { current: {} };
const mockMine: { current: Array<{ id: string; headline: string; status: string }> } = { current: [] };
jest.mock('../../lib/listings', () => ({
  loadMyListings: () => Promise.resolve(mockMine.current),
  loadListingCards: () => Promise.resolve(mockCards.current),
  loadListingExtras: () =>
    Promise.resolve(Object.fromEntries(Object.entries(mockAreas.current).map(([id, areas]) => [id, { areas, headlineI18n: mockHeadlineI18n.current, detailI18n: null }]))),
  loadListingPhotos: () => Promise.resolve(mockPhotos.current),
}));

jest.mock('../../lib/featureFlags', () => ({
  fetchPhase3Flags: () => Promise.resolve({ rankingEnabled: false, ocrEnabled: false }),
}));

jest.mock('../../lib/phase4Flags', () => ({
  fetchPhase4Flags: () => Promise.resolve({ boostsEnabled: false, subscriptionsEnabled: false, qualityEnabled: false }),
}));

jest.mock('../../lib/phase5Flags', () => ({
  fetchPhase5Flags: () => Promise.resolve({
    cityCampaignsEnabled: false,
    multiCityEnabled: false,
    cityAwareDiscoveryEnabled: false,
    cityCommunityEnabled: false,
  }),
}));

jest.mock('../../lib/analytics', () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../lib/campaignAttribution', () => ({
  trackCampaignTouch: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../lib/scaleHardening', () => ({
  trackRateLimitObservation: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../lib/cityDiscovery', () => ({
  shouldUseCityAwareDiscovery: () => false,
  resolveDiscoveryCityCode: () => 'karachi',
  buildDiscoverySubtitle: () => 'Sorted by most recent',
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
  mockRouteParams.current = undefined;
  mockListingCalls.length = 0;
  mockTemplates.current = [{ id: 'template-1' }];
  mockAuth.current = { role: null, session: null };
  mockAreas.current = {};
  mockMine.current = [];
  mockCards.current = {};
  mockHeadlineI18n.current = null;
  mockPhotos.current = {};
});

describe('ServicesScreen', () => {
  it('renders the listings list for an unauthenticated guest', async () => {
    const { findByText, queryByText } = wrap(<ServicesScreen />);
    expect(await findByText('AC service — DHA')).toBeTruthy();
    expect(queryByText('Guest mode')).toBeNull();
  });

  it('shows no price on a listing, only its areas', async () => {
    mockAreas.current = { 'listing-1': ['Gulshan', 'DHA'] };
    const { findByText, queryByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    expect(await findByText('Gulshan')).toBeTruthy();
    expect(await findByText('DHA')).toBeTruthy();
    expect(queryByText(/From Rs/)).toBeNull();
    expect(queryByText(/3500/)).toBeNull();
  });

  it('shows the listing headline in the reader language on the card', async () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } }, language: 'ur' };
    mockAreas.current = { 'listing-1': [] };
    mockHeadlineI18n.current = { source: 'en', en: 'AC service — DHA', ur: 'اے سی سروس — ڈی ایچ اے', ai: true };
    const { findByText, queryByText } = wrap(<ServicesScreen />);
    expect(await findByText('اے سی سروس — ڈی ایچ اے')).toBeTruthy();
    expect(queryByText('Show original')).toBeNull();
  });

  it('shows the original headline to a reader of the same language', async () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } }, language: 'en' };
    mockAreas.current = { 'listing-1': [] };
    mockHeadlineI18n.current = { source: 'en', en: 'AC service — DHA', ur: 'اے سی سروس — ڈی ایچ اے', ai: true };
    const { findByText } = wrap(<ServicesScreen />);
    expect(await findByText('AC service — DHA')).toBeTruthy();
  });

  it('lists an Ustad own services with their status and an Edit button', async () => {
    mockAuth.current = { role: 'worker', session: { user: { id: 'worker-1' } }, workerApprovalStatus: 'approved' };
    mockMine.current = [
      { id: 'm1', headline: 'Leak and tap repair', status: 'active' },
      { id: 'm2', headline: 'Geyser fitting', status: 'paused' },
    ];
    const { findByText, getAllByText } = wrap(<ServicesScreen />);
    expect(await findByText('Leak and tap repair')).toBeTruthy();
    expect(await findByText('Geyser fitting')).toBeTruthy();
    expect(await findByText('Active')).toBeTruthy();
    expect(await findByText('Paused')).toBeTruthy();
    fireEvent.press(getAllByText('Edit')[1]);
    expect(mockNavigate).toHaveBeenCalledWith('ListingWizard', { listingId: 'm2' });
  });

  it('shows no My services list to a customer', async () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } } };
    mockMine.current = [{ id: 'm1', headline: 'Leak and tap repair', status: 'active' }];
    const { findByText, queryByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    expect(queryByText('My services')).toBeNull();
  });

  it('shows who offers the service, their rating, jobs done and a Request a quote prompt', async () => {
    mockCards.current = { 'listing-1': { workerName: 'Usman Khan', rating: 4.7, reviewCount: 12, verified: true, jobsDone: 25 } };
    const { findByText, getByText } = wrap(<ServicesScreen />);
    expect(await findByText('Usman Khan')).toBeTruthy();
    expect(getByText('4.7')).toBeTruthy();
    expect(getByText('(12)')).toBeTruthy();
    expect(getByText('25 jobs done')).toBeTruthy();
    expect(getByText('Request a quote')).toBeTruthy();
  });

  it('marks a Ustad with no reviews yet as new', async () => {
    mockCards.current = { 'listing-1': { workerName: 'Bilal', rating: null, reviewCount: 0, verified: false, jobsDone: 0 } };
    const { findByText } = wrap(<ServicesScreen />);
    expect(await findByText('New')).toBeTruthy();
  });

  it('counts the services and filters them by what is typed in the search box', async () => {
    mockCards.current = { 'listing-1': { workerName: 'Usman Khan', rating: 4.7, reviewCount: 12, verified: true, jobsDone: 3 } };
    const { findByText, getByPlaceholderText, queryByText, getByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    expect(getByText(/^1 services/)).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('Search services or Ustads'), 'usman');
    expect(await findByText('AC service — DHA')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('Search services or Ustads'), 'electrician');
    expect(await findByText('No service matches your search.')).toBeTruthy();
    expect(queryByText('AC service — DHA')).toBeNull();
  });

  it('opens the listing when its card is tapped', async () => {
    const { findByLabelText } = wrap(<ServicesScreen />);
    fireEvent.press(await findByLabelText('AC service — DHA'));
    expect(mockNavigate).toHaveBeenCalledWith('ListingDetail', { listingId: 'listing-1' });
  });

  it('shows the first photo of a listing as its cover', async () => {
    mockPhotos.current = { 'listing-1': ['https://x/cover.jpg'] };
    const { findByText, UNSAFE_getAllByType } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    await waitFor(() => {
      const images = UNSAFE_getAllByType(require('react-native').Image);
      expect(images.some((i: { props: { source: { uri?: string } } }) => i.props.source?.uri === 'https://x/cover.jpg')).toBe(true);
    });
  });

  it('lets an approved Ustad add a service through the wizard, with no price field', async () => {
    mockAuth.current = { role: 'worker', session: { user: { id: 'worker-1' } }, workerApprovalStatus: 'approved' };
    const { findByText, queryByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    expect(queryByText(/Price \(PKR\)/)).toBeNull();
    fireEvent.press(await findByText('Add a service'));
    expect(mockNavigate).toHaveBeenCalledWith('ListingWizard');
  });

  it('shows the inline sign-in hint at the bottom of the listings card for guests', async () => {
    const { findByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    expect(await findByText('Sign in to apply or save services.')).toBeTruthy();
  });

  it('navigates to Auth when the guest hint CTA is pressed', async () => {
    const { findByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    await act(async () => {
      fireEvent.press(await findByText('Sign in / Create account'));
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Auth'));
  });

  it('shows category pills and filters listings through the template category', async () => {
    const { findByText, getByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    mockListingCalls.length = 0;
    fireEvent.press(getByText('AC Technician'));
    await waitFor(() => expect(mockListingCalls.length).toBeGreaterThan(0));
    expect(mockListingCalls[mockListingCalls.length - 1]).toEqual({ templateIds: ['template-1'] });
  });

  it('opens already filtered when a category is passed in', async () => {
    mockRouteParams.current = { category: 'plumber' };
    const { findByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    expect(mockListingCalls.some((c) => c.templateIds?.[0] === 'template-1')).toBe(true);
  });

  it('shows all listings again when All is chosen', async () => {
    mockRouteParams.current = { category: 'plumber' };
    const { findByText, getByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    mockListingCalls.length = 0;
    fireEvent.press(getByText('All'));
    await waitFor(() => expect(mockListingCalls.length).toBeGreaterThan(0));
    expect(mockListingCalls[mockListingCalls.length - 1]).toEqual({ templateIds: undefined });
  });

  it('offers to find nearby workers when a category has no listings', async () => {
    mockTemplates.current = [];
    const { findByText, getByText } = wrap(<ServicesScreen />);
    await findByText('AC service — DHA');
    fireEvent.press(getByText('Welder'));
    fireEvent.press(await findByText('Find nearby workers instead'));
    expect(mockNavigate).toHaveBeenCalledWith('Nearby', { category: 'welder' });
  });
});
