import { supabase } from './supabase';
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
