/** Short video on job posts (docs/job-media-plan.md, Phase 3): up to 30 seconds, 720p, under the 25 MB server limit. */

export const MAX_VIDEO_SECONDS = 30;

/** The server accepts up to 25 MiB; stop a little earlier so a file never lands right at the limit. */
export const MAX_VIDEO_BYTES = 24 * 1024 * 1024;

/** About 9 MB for 30 seconds of video, so weak mobile data can still carry it. */
export const VIDEO_BITRATE = 2_500_000;

export type VideoClip = { uri: string; seconds: number };

/** Whole seconds of recorded time for the server, at least 1 and at most the cap. */
export function videoSecondsFromMillis(ms: number): number {
  return Math.min(MAX_VIDEO_SECONDS, Math.max(1, Math.round(ms / 1000)));
}

function extensionOf(uri: string): string | undefined {
  return uri.split('?')[0].split('.').pop()?.toLowerCase();
}

/** The content type to upload with, from the file extension (the bucket allows these). */
export function videoContentType(uri: string): string {
  const ext = extensionOf(uri);
  if (ext === 'mov') return 'video/quicktime';
  if (ext === '3gp') return 'video/3gpp';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

export function videoExtension(uri: string): string {
  const ext = extensionOf(uri);
  return ext && /^[a-z0-9]{2,4}$/.test(ext) ? ext : 'mp4';
}

/** Recorded time that excludes paused stretches. */
export type Clock = { accumulatedMs: number; segmentStart: number | null };

export function clockElapsed(c: Clock, now: number): number {
  return c.accumulatedMs + (c.segmentStart == null ? 0 : now - c.segmentStart);
}

export function clockStart(c: Clock, now: number): Clock {
  return { accumulatedMs: c.accumulatedMs, segmentStart: now };
}

export function clockPause(c: Clock, now: number): Clock {
  return { accumulatedMs: clockElapsed(c, now), segmentStart: null };
}
