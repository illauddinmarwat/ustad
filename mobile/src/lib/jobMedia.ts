import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import { MAX_VIDEO_BYTES, videoContentType, videoExtension, type VideoClip } from './videoNote';
import { audioContentType, audioExtension, type VoiceNote } from './voiceNote';
import { readBody } from './workerUploads';

/**
 * Photos (and later voice notes and video) on a job post. Signed-in customers only; approved workers in the
 * job's category can view them. Server flag: `app_settings.job_media_enabled` (default false).
 * See docs/job-media-plan.md.
 */

export const MAX_PHOTOS = 4;

let flagCache: { value: boolean; at: number } | null = null;

export async function fetchJobMediaEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'job_media_enabled')
      .maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const value = !error && (raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true'));
    flagCache = { value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

export type JobMediaRow = {
  id: string;
  kind: 'photo' | 'audio' | 'video';
  path: string;
  bytes: number;
  duration_s: number | null;
  created_at: string;
};

export type JobMediaCounts = { job_id: string; photos: number; audios: number; videos: number };

/** "2 photos, 1 voice note" for the job board; null when there is nothing. */
export function describeMediaCounts(c: Pick<JobMediaCounts, 'photos' | 'audios' | 'videos'> | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.photos > 0) parts.push(`${c.photos} photo${c.photos === 1 ? '' : 's'}`);
  if (c.audios > 0) parts.push(`${c.audios} voice note${c.audios === 1 ? '' : 's'}`);
  if (c.videos > 0) parts.push(`${c.videos} video${c.videos === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : null;
}

function randomName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Uploads one already-resized JPEG for a job and registers it. Throws with a readable message on failure. */
export async function uploadJobPhoto(userId: string, jobId: string, uri: string): Promise<void> {
  const body = await readBody(uri);
  const size = body instanceof Uint8Array ? body.byteLength : body.size;
  if (!size) throw new Error('The photo could not be read.');
  const path = `${userId}/${jobId}/${randomName()}.jpg`;
  const { error: upError } = await supabase.storage.from('job-media').upload(path, body, { contentType: 'image/jpeg' });
  if (upError) throw new Error(upError.message);
  const { error } = await supabase.rpc('add_job_media', {
    p_job_id: jobId,
    p_kind: 'photo',
    p_path: path,
    p_bytes: size,
    p_duration_s: null,
  });
  if (error) {
    // The file is not registered, so nobody can read it; delete it so it does not linger.
    await supabase.storage.from('job-media').remove([path]);
    throw new Error(error.message);
  }
}

/** Uploads a recorded voice note for a job and registers it. Throws with a readable message on failure. */
export async function uploadJobAudio(userId: string, jobId: string, note: VoiceNote): Promise<void> {
  const body = await readBody(note.uri);
  const size = body instanceof Uint8Array ? body.byteLength : body.size;
  if (!size) throw new Error('The recording could not be read.');
  const path = `${userId}/${jobId}/${randomName()}.${audioExtension(note.uri)}`;
  const { error: upError } = await supabase.storage
    .from('job-media')
    .upload(path, body, { contentType: audioContentType(note.uri) });
  if (upError) throw new Error(upError.message);
  const { error } = await supabase.rpc('add_job_media', {
    p_job_id: jobId,
    p_kind: 'audio',
    p_path: path,
    p_bytes: size,
    p_duration_s: note.seconds,
  });
  if (error) {
    await supabase.storage.from('job-media').remove([path]);
    throw new Error(error.message);
  }
}

const UPLOAD_ATTEMPTS = 3;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Streams a file to the private bucket from disk (a video can be too big to load into memory). */
async function streamToBucket(path: string, uri: string, contentType: string, onProgress?: (fraction: number) => void) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  const task = FileSystem.createUploadTask(
    `${supabaseUrl}/storage/v1/object/job-media/${path}`,
    uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
    },
    (p) => {
      if (onProgress && p.totalBytesExpectedToSend > 0) onProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
    },
  );
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result?.status ?? 'no response'}).`);
  }
}

/**
 * Uploads a recorded video and registers it. Retries a failed transfer up to three times (weak data), reports
 * progress as a fraction, and throws a readable message when it still fails.
 */
export async function uploadJobVideo(
  userId: string,
  jobId: string,
  clip: VideoClip,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const path = `${userId}/${jobId}/${randomName()}.${videoExtension(clip.uri)}`;
  const contentType = videoContentType(clip.uri);
  let size = 0;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(clip.uri)).blob();
    size = blob.size;
    if (!size) throw new Error('The video could not be read.');
    if (size > MAX_VIDEO_BYTES) throw new Error('VIDEO_TOO_LARGE');
    const { error } = await supabase.storage.from('job-media').upload(path, blob, { contentType });
    if (error) throw new Error(error.message);
  } else {
    const info = await FileSystem.getInfoAsync(clip.uri);
    size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
    if (!size) throw new Error('The video could not be read.');
    if (size > MAX_VIDEO_BYTES) throw new Error('VIDEO_TOO_LARGE');
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
      try {
        onProgress?.(0);
        await streamToBucket(path, clip.uri, contentType, onProgress);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        // An earlier attempt may have stored the file; clear it so the retry can write the same path.
        await supabase.storage.from('job-media').remove([path]);
        if (attempt < UPLOAD_ATTEMPTS) await pause(1500 * attempt);
      }
    }
    if (lastError) throw lastError instanceof Error ? lastError : new Error('The video could not be uploaded.');
  }

  const { error } = await supabase.rpc('add_job_media', {
    p_job_id: jobId,
    p_kind: 'video',
    p_path: path,
    p_bytes: size,
    p_duration_s: clip.seconds,
  });
  if (error) {
    await supabase.storage.from('job-media').remove([path]);
    throw new Error(error.message);
  }
}

/** Uploads a video; returns how many failed (0 or 1) and whether it was too large. The job itself is never lost. */
export async function uploadJobVideoClip(
  userId: string,
  jobId: string,
  clip: VideoClip,
  onProgress?: (fraction: number) => void,
): Promise<{ failed: number; tooLarge: boolean }> {
  try {
    await uploadJobVideo(userId, jobId, clip, onProgress);
    return { failed: 0, tooLarge: false };
  } catch (e) {
    console.warn('[jobMedia] video upload failed', e);
    return { failed: 1, tooLarge: e instanceof Error && e.message === 'VIDEO_TOO_LARGE' };
  }
}

/** Uploads a voice note; returns how many failed (0 or 1). The job itself is never lost. */
export async function uploadJobVoice(userId: string, jobId: string, note: VoiceNote): Promise<{ failed: number }> {
  try {
    await uploadJobAudio(userId, jobId, note);
    return { failed: 0 };
  } catch (e) {
    console.warn('[jobMedia] voice note upload failed', e);
    return { failed: 1 };
  }
}

/** Uploads photos one after another; returns how many failed (the job itself is never lost). */
export async function uploadJobPhotos(userId: string, jobId: string, uris: string[]): Promise<{ failed: number }> {
  let failed = 0;
  for (const uri of uris.slice(0, MAX_PHOTOS)) {
    try {
      await uploadJobPhoto(userId, jobId, uri);
    } catch (e) {
      failed += 1;
      console.warn('[jobMedia] photo upload failed', e);
    }
  }
  return { failed };
}

export type JobMediaItem = JobMediaRow & { url: string | null };

/** The files a viewer may see, each with a short-lived signed URL. */
export async function loadJobMedia(jobId: string): Promise<JobMediaItem[]> {
  const { data, error } = await supabase.rpc('list_job_media', { p_job_id: jobId });
  if (error || !data) return [];
  const rows = data as JobMediaRow[];
  if (rows.length === 0) return [];
  const { data: signed } = await supabase.storage.from('job-media').createSignedUrls(
    rows.map((r) => r.path),
    3600,
  );
  const byPath = new Map((signed ?? []).map((s) => [s.path ?? '', s.signedUrl] as const));
  return rows.map((r) => ({ ...r, url: byPath.get(r.path) ?? null }));
}

export async function removeJobMedia(mediaId: string): Promise<void> {
  const { data, error } = await supabase.rpc('remove_job_media', { p_media_id: mediaId });
  if (error) throw new Error(error.message);
  if (typeof data === 'string' && data) await supabase.storage.from('job-media').remove([data]);
}

export async function loadMediaCounts(jobIds: string[]): Promise<Record<string, JobMediaCounts>> {
  if (jobIds.length === 0) return {};
  const { data, error } = await supabase.rpc('job_media_counts', { p_job_ids: jobIds });
  if (error || !data) return {};
  return Object.fromEntries((data as JobMediaCounts[]).map((c) => [c.job_id, c]));
}
