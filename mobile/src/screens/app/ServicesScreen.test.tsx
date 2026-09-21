import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ServicesScreen from './ServicesScreen';

const mockNavigate = jest.fn();

const mockAuth: {
  current: { role: 'customer' | 'worker' | null; session: { user: { id: string; email?: string } } | null };
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
});

describe('ServicesScreen', () => {
  it('renders the listings list for an unauthenticated guest', async () => {
    const { findByText, queryByText } = wrap(<ServicesScreen />);
    expect(await findByText('AC service — DHA')).toBeTruthy();
    expect(queryByText('Guest mode')).toBeNull();
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
