import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { JobThread } from './JobThread';

const mockRpc = jest.fn();
const mockAuth: { current: { session: { user: { id: string } } | null } } = { current: { session: { user: { id: 'c1' } } } };
const mockSendVoice = jest.fn();
const mockFlag = { current: true };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('../lib/quoteDetails', () => ({ fetchQuoteUpgradesEnabled: () => Promise.resolve(mockFlag.current) }));
jest.mock('../lib/quoteVoice', () => ({
  QUOTE_VOICE_SECONDS: 30,
  sendThreadVoice: (...a: unknown[]) => mockSendVoice(...a),
  signedVoiceUrl: () => Promise.resolve('https://x/voice.m4a'),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('expo-audio');

const thread = [
  { id: 'm1', sender_role: 'worker', body: 'Can I see the tap first?', created_at: '2026-10-01T10:00:00Z', audio_path: null, audio_seconds: null },
  { id: 'm2', sender_role: 'worker', body: null, created_at: '2026-10-01T10:01:00Z', audio_path: 'w1/j1/a.m4a', audio_seconds: 8 },
];

beforeEach(() => {
  [mockRpc, mockSendVoice].forEach((m) => m.mockReset());
  mockAuth.current = { session: { user: { id: 'c1' } } };
  mockFlag.current = true;
  audio.__state.recorderMillis = 0;
  audio.__state.calls.length = 0;
  mockRpc.mockImplementation((name: string) => Promise.resolve(name === 'list_thread' ? { data: thread } : { data: null, error: null }));
});

describe('JobThread voice notes', () => {
  it('shows text and voice notes in the thread, with a player for the voice note', async () => {
    const u = render(<JobThread jobId="j1" workerId="w1" viewer="customer" />);
    expect(await u.findByText('Can I see the tap first?')).toBeTruthy();
    expect(await u.findByText('0:00 / 0:08')).toBeTruthy();
  });

  it('offers recording to a signed-in participant when the feature is on', async () => {
    const u = render(<JobThread jobId="j1" workerId="w1" viewer="customer" />);
    expect(await u.findByText('Record voice note')).toBeTruthy();
  });

  it('does not offer recording while the feature is off', async () => {
    mockFlag.current = false;
    const u = render(<JobThread jobId="j1" workerId="w1" viewer="customer" />);
    await u.findByText('Can I see the tap first?');
    expect(u.queryByText('Record voice note')).toBeNull();
  });

  it('does not offer recording to a guest poster, and does not try to play voice notes for them', async () => {
    mockAuth.current = { session: null };
    const u = render(<JobThread jobId="j1" workerId="w1" viewer="customer" token="tok" />);
    await u.findByText('Can I see the tap first?');
    expect(u.queryByText('Record voice note')).toBeNull();
    expect(u.queryByText('0:00 / 0:08')).toBeNull();
    expect(u.getAllByText('Voice note').length).toBeGreaterThan(0);
  });

  it('records, sends the voice note and reloads the thread', async () => {
    mockSendVoice.mockResolvedValue(null);
    const u = render(<JobThread jobId="j1" workerId="w1" viewer="customer" />);
    fireEvent.press(await u.findByLabelText('Record voice note'));
    await waitFor(() => expect(audio.__state.calls).toContain('record'));
    audio.__state.recorderMillis = 6_000;
    fireEvent.press(await u.findByLabelText('Stop'));
    fireEvent.press(await u.findByText('Send voice note'));
    await waitFor(() => expect(mockSendVoice).toHaveBeenCalledWith('c1', 'j1', 'w1', { uri: 'file:///rec.m4a', seconds: 6 }));
    await waitFor(() => expect(mockRpc.mock.calls.filter((c) => c[0] === 'list_thread').length).toBeGreaterThan(1));
  });

  it('shows the error when the voice note cannot be sent', async () => {
    mockSendVoice.mockResolvedValue('not allowed');
    const u = render(<JobThread jobId="j1" workerId="w1" viewer="customer" />);
    fireEvent.press(await u.findByLabelText('Record voice note'));
    await waitFor(() => expect(audio.__state.calls).toContain('record'));
    audio.__state.recorderMillis = 3_000;
    fireEvent.press(await u.findByLabelText('Stop'));
    fireEvent.press(await u.findByText('Send voice note'));
    expect(await u.findByText('not allowed')).toBeTruthy();
  });
});
