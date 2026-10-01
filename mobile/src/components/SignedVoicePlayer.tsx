import { useEffect, useState } from 'react';

import { signedVoiceUrl } from '../lib/quoteVoice';

import { VoicePlayer } from './VoiceRecorder';
import { BiText } from './ui/BiText';

/** Plays a voice note stored in the private quote-voice bucket; says so when it cannot be loaded. */
export function SignedVoicePlayer({ path, seconds }: { path: string; seconds?: number | null }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    signedVoiceUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (url === undefined) return null;
  if (url === null) return <BiText id="media.recordFailed" variant="caption" tone="muted" />;
  return <VoicePlayer uri={url} seconds={seconds} />;
}
