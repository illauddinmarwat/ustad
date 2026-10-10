import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JobDetailScreen from './JobDetailScreen';

const mockRpc = jest.fn();
const mockRt: { current: Record<string, unknown> | null } = { current: null };
const mockJob: { current: Record<string, unknown> } = { current: {} };
const mockAuth: { current: { role: string; session: { user: { id: string } } } } = {
  current: { role: 'customer', session: { user: { id: 'c1' } } },
};

jest.mock('../../config/env', () => ({ useLiveDatabase: true }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('../../lib/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../lib/phase4Flags', () => ({ fetchPhase4Flags: () => Promise.resolve({ realtimeEnabled: true, qualityEnabled: false }) }));
jest.mock('../../components/FinalPriceSection', () => ({ FinalPriceSection: () => null }));
jest.mock('../../components/JobContactSection', () => ({ JobContactSection: () => null }));
jest.mock('../../components/JobPaymentSection', () => ({ JobPaymentSection: () => null }));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../../lib/supabase', () => {
  const result = (table: string) => ({ data: table === 'jobs' ? mockJob.current : table === 'job_realtime_states' ? mockRt.current : null, error: null });
  const chain = (table: string): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => {
        if (prop === 'then') return (res: (v: unknown) => void) => res({ data: table === 'messages' ? [] : result(table).data, error: null });
        if (prop === 'maybeSingle') return () => Promise.resolve(result(table));
        return () => chain(table);
      },
    });
  return { supabase: { from: (t: string) => chain(t), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => undefined, rpc: (...a: unknown[]) => mockRpc(...a) } };
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

const wrap = (focus?: string) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <JobDetailScreen {...({ route: { params: { jobId: 'j1', focus } }, navigation: { setOptions: jest.fn(), navigate: jest.fn() } } as any)} />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  mockJob.current = { ...baseJob };
  mockAuth.current = { role: 'worker', session: { user: { id: 'w1' } } };
  mockRt.current = null;
});

describe('JobDetailScreen: on the way', () => {
  it('offers start en-route, and says so under the buttons after a tap', async () => {
    const u = wrap();
    fireEvent.press(await u.findByText('Start en-route (ETA ~30m)'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('worker_set_job_realtime_state', {
        p_job_id: 'j1', p_is_en_route: true, p_eta_minutes: 30, p_timer_running: null,
      }),
    );
    expect(await u.findByText(/You are on the way/)).toBeTruthy();
  });

  it('shows only the buttons that make sense: arrived while en route, and no timer', async () => {
    mockRt.current = { is_en_route: true, eta_bucket: '30m', timer_started_at: '2026-10-08T10:00:00Z', timer_accum_seconds: 0 };
    const u = wrap();
    expect(await u.findByText('Arrived / stop en-route')).toBeTruthy();
    expect(u.queryByText('Stop job timer')).toBeNull();
    expect(u.queryByText('Start en-route (ETA ~30m)')).toBeNull();
    expect(u.queryByText('Start job timer')).toBeNull();
  });

  it('shows the server error right under the buttons instead of out of sight', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'job must be assigned or completed' } });
    const u = wrap();
    fireEvent.press(await u.findByText('Start en-route (ETA ~30m)'));
    expect(await u.findByText('job must be assigned or completed')).toBeTruthy();
  });

  it('offers Work is done after Arrived, instead of asking to go en-route again', async () => {
    mockRt.current = { is_en_route: false, eta_bucket: null, timer_started_at: null, timer_accum_seconds: 0 };
    const u = wrap();
    expect(await u.findByText('Work is done')).toBeTruthy();
    expect(u.queryByText('Start en-route (ETA ~30m)')).toBeNull();
  });

  it('keeps Work is done reachable before leaving, without touching any timer', async () => {
    mockRt.current = { is_en_route: true, eta_bucket: '30m', timer_started_at: '2026-10-08T10:00:00Z', timer_accum_seconds: 0 };
    const u = wrap();
    fireEvent.press(await u.findByText('Work is done'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_mark_work_done', { p_job_id: 'j1' }));
    expect(mockRpc).not.toHaveBeenCalledWith('worker_set_job_realtime_state', expect.anything());
  });
});

describe('JobDetailScreen: opened from a notification', () => {
  it('opens the conversation straight away for a message notification', async () => {
    const u = wrap('messages');
    expect(await u.findByText('No messages yet.')).toBeTruthy();
  });
});
