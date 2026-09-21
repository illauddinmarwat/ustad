import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { InboxSection } from './InboxSection';

const mockNavigate = jest.fn();
const mockRpc = jest.fn();
const mockData: { current: Record<string, unknown[]> } = { current: {} };

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../lib/directRequests', () => ({
  ...jest.requireActual('../lib/directRequests'),
  fetchDirectRequestFlags: () => Promise.resolve({ enabled: true }),
}));

// A tiny chainable query builder: every filter returns itself; awaiting it yields the table's rows.
jest.mock('../lib/supabase', () => {
  const chain = (table: string) => {
    const result = () => Promise.resolve({ data: mockData.current[table] ?? [], error: null });
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: (mockData.current[table] ?? [])[0] ?? null, error: null });
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej);
    return q;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: (...a: unknown[]) => mockRpc(...a),
    },
  };
});

const app = (over: Record<string, unknown> = {}) => ({
  id: 'a1', listing_id: 'l1', customer_id: 'c1', note: 'Monday please', status: 'pending', created_at: '2026-09-21T10:00:00Z', ...over,
});
const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1', title: 'Fix tap', description: 'Leaking', status: 'open', origin: 'customer_job', customer_id: 'c1',
  worker_id: null, target_worker_id: null, budget_pkr: null, preferred_time: null, location_text: null,
  created_at: '2026-09-21T09:00:00Z', ...over,
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockRpc.mockReset().mockResolvedValue({ data: [], error: null });
  mockData.current = {};
});

describe('InboxSection (worker)', () => {
  it('shows service applications with accept and decline that keep the existing RPCs', async () => {
    mockData.current = {
      worker_service_listings: [{ id: 'l1', headline: 'AC service' }],
      listing_applications: [app()],
    };
    const { findByText, getByText } = render(<InboxSection userId="w1" role="worker" />);
    expect(await findByText('AC service')).toBeTruthy();
    expect(getByText('Service')).toBeTruthy();
    fireEvent.press(getByText('Accept'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_accept_listing_application', { application_id: 'a1' }));
    fireEvent.press(getByText('Decline'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_decline_listing_application', { application_id: 'a1' }));
  });

  it('shows a targeted direct request with its actions', async () => {
    mockData.current = {
      jobs: [job({ id: 'jr', title: 'Kitchen tap', target_worker_id: 'w1', budget_pkr: 1500 })],
      profiles: [{ id: 'c1', display_name: 'Ali' }],
    };
    const { findByText, getByText } = render(<InboxSection userId="w1" role="worker" />);
    expect(await findByText('Kitchen tap')).toBeTruthy();
    fireEvent.press(getByText('Accept budget'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_accept_direct_request', { p_job_id: 'jr' }));
  });

  it('shows my quote on a board job and opens it', async () => {
    mockRpc.mockImplementation((name: string) =>
      name === 'list_my_quotes'
        ? Promise.resolve({
            data: [{ quote_id: 'q1', job_id: 'j9', job_title: 'Wire two rooms', job_status: 'quoted', amount_pkr: 9000, status: 'pending', created_at: '2026-09-21T08:00:00Z' }],
          })
        : Promise.resolve({ data: [], error: null }),
    );
    const { findByText, getByText } = render(<InboxSection userId="w1" role="worker" />);
    fireEvent.press(await findByText('Wire two rooms'));
    expect(getByText('Your quote: Rs 9000')).toBeTruthy();
    expect(mockNavigate).toHaveBeenCalledWith('BoardJob', { jobId: 'j9' });
  });

  it('opens an assigned job of any origin in the job screen', async () => {
    mockData.current = { jobs: [job({ id: 'ja', title: 'Wire kitchen', status: 'assigned', worker_id: 'w1', origin: 'service_listing' })] };
    const { findByText } = render(<InboxSection userId="w1" role="worker" />);
    fireEvent.press(await findByText('Wire kitchen'));
    expect(mockNavigate).toHaveBeenCalledWith('JobDetail', { jobId: 'ja' });
  });
});

describe('InboxSection (customer)', () => {
  it('shows an application the customer sent, with its status and no worker actions', async () => {
    mockData.current = {
      listing_applications: [app({ status: 'declined' })],
      worker_service_listings: [{ id: 'l1', headline: 'AC service' }],
    };
    const { findByText, queryByText } = render(<InboxSection userId="c1" role="customer" />);
    expect(await findByText('AC service')).toBeTruthy();
    expect(await findByText('Declined')).toBeTruthy();
    expect(queryByText('Accept')).toBeNull();
  });

  it('shows a posted job with a quote to accept', async () => {
    mockData.current = {
      jobs: [job({ id: 'jp', title: 'Fix tap', status: 'quoted' })],
      quotes: [{ id: 'q1', job_id: 'jp', amount_pkr: 1800, message: 'Tomorrow', status: 'pending' }],
    };
    const { findByText, getByText } = render(<InboxSection userId="c1" role="customer" />);
    expect(await findByText('Rs 1800')).toBeTruthy();
    fireEvent.press(getByText('Accept quote'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('customer_accept_quote', { p_quote_id: 'q1' }));
    fireEvent.press(getByText('Quotes'));
    expect(mockNavigate).toHaveBeenCalledWith('PostedJob', { jobId: 'jp' });
  });

  it('filters by Pending, Active and Done', async () => {
    mockData.current = {
      jobs: [
        job({ id: 'j1', title: 'Waiting job', status: 'open' }),
        job({ id: 'j2', title: 'Running job', status: 'assigned', worker_id: 'w1' }),
        job({ id: 'j3', title: 'Finished job', status: 'closed', worker_id: 'w1' }),
      ],
    };
    const { findByText, getByText, queryByText } = render(<InboxSection userId="c1" role="customer" />);
    await findByText('Waiting job');
    fireEvent.press(getByText('Active'));
    expect(getByText('Running job')).toBeTruthy();
    expect(queryByText('Waiting job')).toBeNull();
    fireEvent.press(getByText('Done'));
    expect(getByText('Finished job')).toBeTruthy();
    expect(queryByText('Running job')).toBeNull();
    fireEvent.press(getByText('Pending'));
    expect(getByText('Waiting job')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    const { findByText } = render(<InboxSection userId="c1" role="customer" />);
    expect(await findByText('Nothing here yet.')).toBeTruthy();
  });
});
