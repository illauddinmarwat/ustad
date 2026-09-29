import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from './supabase';

export type UploadSet = {
  photo?: string | null;
  cnicFront?: string | null;
  cnicBack?: string | null;
};

const KEY = 'ustad.pendingWorkerUploads.v1';
const DIR = `${FileSystem.documentDirectory ?? ''}pending-uploads/`;

async function uploadImage(userId: string, bucket: string, path: string, uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(`${userId}/${path}.jpg`, blob, { upsert: true, contentType: 'image/jpeg' });
    return error ? null : `${userId}/${path}.jpg`;
  } catch {
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
    if (error) return false;
  }

  return (!set.photo || !!photoPath) && (!set.cnicFront || !!frontPath) && (!set.cnicBack || !!backPath);
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

/** Keeps the picked images on the device until the Ustad first signs in (email confirmation means no session at sign-up). */
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
