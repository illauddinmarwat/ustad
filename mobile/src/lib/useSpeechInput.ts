import { useCallback, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

import type { Lang } from './i18nText';

/**
 * Speak instead of typing, using the phone's own speech recognition (free; nothing is recorded or sent by us).
 * Urdu is understood less well than English, so the person can change the speaking language and always fix the
 * text by hand. `onText` receives the whole spoken text so far (it grows while the person talks).
 */
export type SpeechError = 'denied' | 'unavailable' | 'failed';

const LOCALE: Record<Lang, string> = { en: 'en-US', ur: 'ur-PK' };

export function isSpeechAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function useSpeechInput(onText: (spoken: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);
  const live = useRef(false);

  useSpeechRecognitionEvent('result', (e) => {
    if (!live.current) return;
    const spoken = e.results?.[0]?.transcript;
    if (spoken) onText(spoken);
  });
  useSpeechRecognitionEvent('end', () => {
    live.current = false;
    setListening(false);
  });
  useSpeechRecognitionEvent('error', (e) => {
    live.current = false;
    setListening(false);
    setError(e.error === 'not-allowed' ? 'denied' : e.error === 'aborted' || e.error === 'no-speech' ? null : 'failed');
  });

  const start = useCallback(async (lang: Lang) => {
    setError(null);
    if (!isSpeechAvailable()) {
      setError('unavailable');
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError('denied');
        return;
      }
      live.current = true;
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: LOCALE[lang], interimResults: true, continuous: false });
    } catch {
      live.current = false;
      setListening(false);
      setError('failed');
    }
  }, []);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Nothing is listening; the state is already right.
    }
    setListening(false);
  }, []);

  return { listening, error, start, stop, available: isSpeechAvailable() };
}
