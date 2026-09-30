import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type UploadSet = {
  photo?: string | null;
  cnicFront?: string | null;
  cnicBack?: string | null;
};

const KEY = 'ustad.pendingWorkerUploads.v1';
const DIR = `${FileSystem.documentDirectory ?? ''}pending-uploads/`;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/**
 * On device, read the file as base64 and upload raw bytes: `fetch(file://).blob()` can upload an empty
 * object on React Native, which "succeeds" but leaves an unreadable image. Web has no file system, so it uses a blob.
 */
export async function readBody(uri: string): Promise<Uint8Array | Blob> {
  if (Platform.OS === 'web') return (await fetch(uri)).blob();
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  return base64ToBytes(b64);
}

async function uploadImage(userId: string, bucket: string, path: string, uri: string): Promise<string | null> {
  try {
    const body = await readBody(uri);
    const size = body instanceof Uint8Array ? body.byteLength : body.size;
    if (!size) throw new Error('empty image');
    const { error } = await supabase.storage
      .from(bucket)
      .upload(`${userId}/${path}.jpg`, body, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    return `${userId}/${path}.jpg`;
  } catch (e) {
    console.warn(`[workerUploads] ${bucket}/${path} failed`, e);
    return null;
  }
}

/** Uploads the given images in parallel and links them on the worker profile. True when every supplied image landed. */
export async function uploadWorkerFiles(userId: string, set: UploadSet): Promise<boolean> {
  const [photoPath, frontPath, backPath] = await Promise.all([
    set.photo ? uploadImage(userId, 'worker-photos', 'profile', set.photo) : null,
    set.cnicFront ? uploadImage(userId, 'worker-documents', 'cnic-front', set.cnicFront) : null,
    set.cnicBack ? uploadImage(userId, 'worker-documents', 'cnic-back', set.cnicBack) : null,
  ]);

  const update: Record<string, string> = {};
  if (photoPath) update.photo_url = supabase.storage.from('worker-photos').getPublicUrl(photoPath).data.publicUrl;
  if (frontPath) update.cnic_front_url = frontPath;
  if (backPath) update.cnic_back_url = backPath;
  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('worker_profiles').update(update).eq('user_id', userId);
    if (error) {
      console.warn('[workerUploads] linking files to profile failed', error);
      return false;
    }
  }

  return (!set.photo || !!photoPath) && (!set.cnicFront || !!frontPath) && (!set.cnicBack || !!backPath);
}

/** Saves the pinned map location on the worker profile (used for nearby search once approved). */
export async function saveWorkerLocation(userId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase
    .from('worker_profiles')
    .update({ lat, lng, location_updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) console.warn('[workerUploads] saving location failed', error);
}

async function persistCopy(uri: string | null | undefined, name: string): Promise<string | null> {
  if (!uri || !FileSystem.documentDirectory) return null;
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    const dest = `${DIR}${name}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return null;
  }
}

/** Keeps the picked images on the device so a failed upload is retried the next time the Ustad signs in. */
export async function stashPendingUploads(email: string, set: UploadSet): Promise<void> {
  const saved: UploadSet = {
    photo: await persistCopy(set.photo, 'photo'),
    cnicFront: await persistCopy(set.cnicFront, 'cnic-front'),
    cnicBack: await persistCopy(set.cnicBack, 'cnic-back'),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), files: saved }));
}

/** Uploads stashed images once the matching account is signed in. Failed attempts stay stashed for the next login. */
export async function flushPendingUploads(userId: string, email: string | undefined): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw || !email) return;
    const stash = JSON.parse(raw) as { email: string; files: UploadSet };
    if (stash.email !== email.trim().toLowerCase()) return;

    const ok = await uploadWorkerFiles(userId, stash.files);
    if (!ok) return;

    await AsyncStorage.removeItem(KEY);
    await Promise.all(
      Object.values(stash.files)
        .filter((p): p is string => !!p)
        .map((p) => FileSystem.deleteAsync(p, { idempotent: true }))
    );
  } catch {
    // keep the stash; it retries on the next sign-in
  }
}
