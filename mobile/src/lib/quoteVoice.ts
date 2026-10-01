import { supabase } from './supabase';
import { audioContentType, audioExtension, type VoiceNote } from './voiceNote';
import { readBody } from './workerUploads';

/**
 * Voice notes on quotes and in the pre-assignment thread (docs/job-quotes-plan.md, Phase 3): up to 30 seconds,
 * stored in the private `quote-voice` bucket at {sender}/{job}/{file}. Only the Ustad, the job's signed-in
 * owner and admins can hear them. Needs `quote_upgrades_enabled`.
 */

export const QUOTE_VOICE_SECONDS = 30;

function randomName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Uploads the recording and returns its storage path. Throws with a readable message on failure. */
async function uploadVoiceFile(userId: string, jobId: string, note: VoiceNote): Promise<string> {
  const body = await readBody(note.uri);
  const size = body instanceof Uint8Array ? body.byteLength : body.size;
  if (!size) throw new Error('The recording could not be read.');
  const path = `${userId}/${jobId}/${randomName()}.${audioExtension(note.uri)}`;
  const { error } = await supabase.storage.from('quote-voice').upload(path, body, { contentType: audioContentType(note.uri) });
  if (error) throw new Error(error.message);
  return path;
}

async function discard(path: string): Promise<void> {
  try {
    await supabase.storage.from('quote-voice').remove([path]);
  } catch {
    // the file is not registered, so nobody can hear it; ignore a failed clean-up
  }
}

/** Attaches a recording to the worker's own pending quote. Returns an error message, or null on success. */
export async function attachQuoteVoice(userId: string, jobId: string, quoteId: string, note: VoiceNote): Promise<string | null> {
  let path: string;
  try {
    path = await uploadVoiceFile(userId, jobId, note);
  } catch (e) {
    return e instanceof Error ? e.message : 'The voice note could not be uploaded.';
  }
  const { error } = await supabase.rpc('worker_attach_quote_voice', { p_quote_id: quoteId, p_path: path, p_seconds: note.seconds });
  if (error) {
    await discard(path);
    return error.message;
  }
  return null;
}

/** Sends a recording into the thread between the Ustad and the job's owner. Returns an error message, or null. */
export async function sendThreadVoice(userId: string, jobId: string, workerId: string, note: VoiceNote): Promise<string | null> {
  let path: string;
  try {
    path = await uploadVoiceFile(userId, jobId, note);
  } catch (e) {
    return e instanceof Error ? e.message : 'The voice note could not be uploaded.';
  }
  const { error } = await supabase.rpc('post_thread_voice', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_path: path,
    p_seconds: note.seconds,
  });
  if (error) {
    await discard(path);
    return error.message;
  }
  return null;
}

/** A short-lived link to play a voice note; null when the caller may not hear it. */
export async function signedVoiceUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from('quote-voice').createSignedUrl(path, 3600);
    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}
