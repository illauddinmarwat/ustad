import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AiHelperScreen from './AiHelperScreen';

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockPermission = { granted: true };
const handlers: Record<string, (e: unknown) => void> = {};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => true,
    requestPermissionsAsync: () => Promise.resolve(mockPermission),
    start: (o: unknown) => mockStart(o),
    stop: () => mockStop(),
  },
  useSpeechRecognitionEvent: (name: string, fn: (e: unknown) => void) => {
    handlers[name] = fn;
  },
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ language: 'en' }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ popTo: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { mode: 'job', categories: ['plumber'] } }),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <AiHelperScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockStart.mockReset();
  mockStop.mockReset();
  mockPermission.granted = true;
});

describe('AiHelperScreen microphone', () => {
  it('shows a microphone and a tip about it, instead of the keyboard tip', () => {
    const u = wrap();
    expect(u.getByLabelText('Speak')).toBeTruthy();
    expect(u.getByText('Tip: tap the microphone and speak.')).toBeTruthy();
    expect(u.queryByText('Tip: you can speak. Tap the microphone on your keyboard.')).toBeNull();
  });

  it('listens in the chosen language and puts the spoken words after what was typed', async () => {
    const u = wrap();
    fireEvent.changeText(u.UNSAFE_getByType(TextInput), 'tap leaking');
    fireEvent.press(u.getByText('اردو'));
    fireEvent.press(u.getByLabelText('Speak'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ lang: 'ur-PK', interimResults: true })));
    act(() => handlers.result({ results: [{ transcript: 'kitchen mein' }] }));
    expect(u.UNSAFE_getByType(TextInput).props.value).toBe('tap leaking kitchen mein');
    act(() => handlers.result({ results: [{ transcript: 'kitchen mein pani' }] }));
    expect(u.UNSAFE_getByType(TextInput).props.value).toBe('tap leaking kitchen mein pani');
    expect(u.getByText(/Listening/)).toBeTruthy();
    act(() => handlers.end({}));
    expect(u.queryByText(/Listening/)).toBeNull();
  });

  it('stops listening when the microphone is tapped again', async () => {
    const u = wrap();
    fireEvent.press(u.getByLabelText('Speak'));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    fireEvent.press(await u.findByLabelText('Stop'));
    expect(mockStop).toHaveBeenCalled();
  });

  it('says what to do when the microphone is not allowed, and does not start', async () => {
    mockPermission.granted = false;
    const u = wrap();
    fireEvent.press(u.getByLabelText('Speak'));
    expect(await u.findByText(/Allow the microphone/)).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('asks to try again or type when nothing could be understood', async () => {
    const u = wrap();
    fireEvent.press(u.getByLabelText('Speak'));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    act(() => handlers.error({ error: 'network' }));
    expect(await u.findByText(/Could not hear you/)).toBeTruthy();
  });
});
