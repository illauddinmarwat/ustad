import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JobDetailScreen from './JobDetailScreen';

const mockRpc = jest.fn();
const mockJob: { current: Record<string, unknown> } = { current: {} };
const mockAuth: { current: { role: string; session: { user: { id: string } } } } = {
  current: { role: 'customer', session: { user: { id: 'c1' } } },
};

jest.mock('../../config/env', () => ({ useLiveDatabase: true }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../lib/phase4Flags', () => ({ fetchPhase4Flags: () => Promise.resolve({ realtimeEnabled: false, qualityEnabled: false }) }));
jest.mock('../../components/FinalPriceSection', () => ({ FinalPriceSection: () => null }));
jest.mock('../../components/JobContactSection', () => ({ JobContactSection: () => null }));
jest.mock('../../components/JobPaymentSection', () => ({ JobPaymentSection: () => null }));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../../lib/supabase', () => {
  const result = (table: string) => ({ data: table === 'jobs' ? mockJob.current : null, error: null });
  const chain = (table: string): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => {
        if (prop === 'then') return (res: (v: unknown) => void) => res({ data: table === 'messages' ? [] : result(table).data, error: null });
        if (prop === 'maybeSingle') return () => Promise.resolve(result(table));
        return () => chain(table);
      },
    });
  return { supabase: { from: (t: string) => chain(t), rpc: (...a: unknown[]) => mockRpc(...a) } };
});

const baseJob = {
  id: 'j1',
  title: 'Fix kitchen tap',
  description: 'Leaking',
  status: 'assigned',
  origin: 'customer_job',
  customer_id: 'c1',
  worker_id: 'w1',
  category: 'plumber',
  location_text: null,
  worker_done_at: null,
  completion_note: null,
};

const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <JobDetailScreen {...({ route: { params: { jobId: 'j1' } }, navigation: { setOptions: jest.fn(), navigate: jest.fn() } } as any)} />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  mockJob.current = { ...baseJob };
  mockAuth.current = { role: 'customer', session: { user: { id: 'c1' } } };
});

describe('JobDetailScreen: finishing the work', () => {
  it('lets the Ustad say the work is done, but not complete the job', async () => {
    mockAuth.current = { role: 'worker', session: { user: { id: 'w1' } } };
    const u = wrap();
    expect(await u.findByText('Work is done')).toBeTruthy();
    expect(u.queryByText('Mark job complete')).toBeNull();
    fireEvent.press(u.getByText('Work is done'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_mark_work_done', { p_job_id: 'j1' }));
  });

  it('tells the Ustad to wait for the customer once the work is marked done', async () => {
    mockAuth.current = { role: 'worker', session: { user: { id: 'w1' } } };
    mockJob.current = { ...baseJob, worker_done_at: '2026-10-04T10:00:00Z' };
    const u = wrap();
    expect(await u.findByText(/Waiting for the customer to confirm/)).toBeTruthy();
    expect(u.queryByText('Work is done')).toBeNull();
  });

  it('shows the Ustad what the customer said was left', async () => {
    mockAuth.current = { role: 'worker', session: { user: { id: 'w1' } } };
    mockJob.current = { ...baseJob, completion_note: 'Tap still drips' };
    const u = wrap();
    expect(await u.findByText(/Tap still drips/)).toBeTruthy();
    expect(u.getByText('Work is done')).toBeTruthy();
  });

  it('asks the customer to confirm once the Ustad says it is done', async () => {
    mockJob.current = { ...baseJob, worker_done_at: '2026-10-04T10:00:00Z' };
    const u = wrap();
    expect(await u.findByText('The Ustad says the work is done')).toBeTruthy();
    fireEvent.press(u.getByText('Yes, the work is done'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('mark_job_completed', { job_id: 'j1' }));
  });

  it('lets the customer say it is not finished, with a note', async () => {
    mockJob.current = { ...baseJob, worker_done_at: '2026-10-04T10:00:00Z' };
    const u = wrap();
    fireEvent.press(await u.findByText('Not finished yet'));
    fireEvent.changeText(u.getByLabelText('What is left to do? (optional)'), 'Tap still drips');
    fireEvent.press(u.getByText('Tell the Ustad'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('customer_reject_completion', { p_job_id: 'j1', p_note: 'Tap still drips' }),
    );
  });

  it('lets the customer complete the job without waiting for the Ustad', async () => {
    const u = wrap();
    expect(await u.findByText('Mark job complete')).toBeTruthy();
    expect(u.queryByText('The Ustad says the work is done')).toBeNull();
  });
});
