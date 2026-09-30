import { RecordingPresets, type RecordingOptions } from 'expo-audio';

/** Voice notes on job posts (docs/job-media-plan.md): up to 60 seconds, mono AAC, small enough for weak data. */

export const MAX_AUDIO_SECONDS = 60;

/** Mono, 22 kHz, 48 kbps: about 0.4 MB for a full minute, well under the 3 MB server limit. */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48000,
};

export type VoiceNote = { uri: string; seconds: number };

/** Whole seconds for the server, at least 1 and at most the cap. */
export function secondsFromMillis(ms: number): number {
  return Math.min(MAX_AUDIO_SECONDS, Math.max(1, Math.round(ms / 1000)));
}

/** "0:07", "1:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

/** The content type to upload with, from the recording's file extension (the bucket allows these). */
export function audioContentType(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'webm') return 'audio/webm';
  if (ext === '3gp') return 'audio/3gpp';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'aac') return 'audio/aac';
  return 'audio/mp4';
}

export function audioExtension(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,4}$/.test(ext) ? ext : 'm4a';
}
