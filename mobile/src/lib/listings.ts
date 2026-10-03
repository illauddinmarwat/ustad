import { supabase } from './supabase';
import { looksLikeContact } from './contactCheck';
import type { I18n } from './i18nText';
import { readBody } from './workerUploads';

/**
 * Service listings (flow 2). A listing has no price: the Ustad's quote is the only price, so a customer
 * asks a listing's Ustad for a quote (`create_listing_request`) instead of applying. Photos of past work
 * (up to four) are public like the listing. Server flag: `app_settings.listing_quote_requests_enabled`.
 * See docs/wizard-ai-plan.md (Phase 2).
 */

export const MAX_LISTING_PHOTOS = 4;
const BUCKET = 'listing-media';

let flagCache: { value: boolean; at: number } | null = null;

export async function fetchListingRequestsEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'listing_quote_requests_enabled')
      .maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const value = !error && (raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true'));
    flagCache = { value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

/** Test hook: forget the cached flag. */
export function resetListingFlagCache(): void {
  flagCache = null;
}

export type ListingForm = {
  templateId: string;
  headline: string;
  about: string;
  /** Comma or newline separated areas, e.g. "Gulshan, North Nazimabad". */
  areas: string;
};

export type ListingErrors = Partial<Record<'templateId' | 'headline' | 'about' | 'contact', string>>;

export type ListingResult =
  | { ok: true; value: { templateId: string; headline: string; about: string; areas: string[] } }
  | { ok: false; errors: ListingErrors };

/** Splits "Gulshan, North Nazimabad" into clean, unique, capped area names. */
export function parseAreas(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n،]/)) {
    const area = part.trim().replace(/\s+/g, ' ');
    const key = area.toLowerCase();
    if (!area || area.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push(area);
    if (out.length >= 10) break;
  }
  return out;
}

export function validateListing(form: ListingForm): ListingResult {
  const errors: ListingErrors = {};
  const headline = form.headline.trim();
  const about = form.about.trim();
  if (!form.templateId) errors.templateId = 'Choose the service you offer.';
  if (headline.length < 5) errors.headline = 'Write a short headline (at least 5 characters).';
  if (about.length < 10) errors.about = 'Tell customers about your work (at least 10 characters).';
  if ([headline, about, form.areas].some(looksLikeContact)) {
    errors.contact = 'Do not include phone numbers or links. Customers see your number after they accept your quote.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { templateId: form.templateId, headline, about, areas: parseAreas(form.areas) } };
}

function randomName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Uploads one already-resized JPEG for a listing and registers it. Throws with a readable message. */
export async function uploadListingPhoto(userId: string, listingId: string, uri: string): Promise<void> {
  const body = await readBody(uri);
  const size = body instanceof Uint8Array ? body.byteLength : body.size;
  if (!size) throw new Error('The photo could not be read.');
  const path = `${userId}/${listingId}/${randomName()}.jpg`;
  const { error: upError } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (upError) throw new Error(upError.message);
  const { error } = await supabase.rpc('add_listing_media', { p_listing_id: listingId, p_path: path, p_bytes: size });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

/** Uploads photos one after another; returns how many failed (the listing itself is never lost). */
export async function uploadListingPhotos(
  userId: string,
  listingId: string,
  uris: string[],
): Promise<{ failed: number }> {
  let failed = 0;
  for (const uri of uris.slice(0, MAX_LISTING_PHOTOS)) {
    try {
      await uploadListingPhoto(userId, listingId, uri);
    } catch (e) {
      failed += 1;
      console.warn('[listings] photo upload failed', e);
    }
  }
  return { failed };
}

/** Public photo URLs per listing id, in upload order. Listings with no photos are absent. */
export async function loadListingPhotos(listingIds: string[]): Promise<Record<string, string[]>> {
  if (listingIds.length === 0) return {};
  const { data, error } = await supabase.rpc('list_listing_media', { p_listing_ids: listingIds });
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, string[]> = {};
  for (const row of data as Array<{ listing_id: string; path: string }>) {
    const url = supabase.storage.from(BUCKET).getPublicUrl(row.path).data.publicUrl;
    if (url) (out[row.listing_id] ??= []).push(url);
  }
  return out;
}

export type ListingExtras = { areas: string[]; headlineI18n: I18n; detailI18n: I18n };

/** Areas and the English/Urdu versions per listing id, for cards and the detail screen. */
export async function loadListingExtras(listingIds: string[]): Promise<Record<string, ListingExtras>> {
  if (listingIds.length === 0) return {};
  const { data, error } = await supabase
    .from('worker_service_listings')
    .select('id,service_areas,headline_i18n,detail_i18n')
    .in('id', listingIds);
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, ListingExtras> = {};
  for (const row of data as Array<{ id: string; service_areas: unknown; headline_i18n: I18n; detail_i18n: I18n }>) {
    const areas = Array.isArray(row.service_areas) ? row.service_areas.filter((a): a is string => typeof a === 'string' && !!a) : [];
    out[row.id] = { areas, headlineI18n: row.headline_i18n ?? null, detailI18n: row.detail_i18n ?? null };
  }
  return out;
}

export type OwnPhoto = { id: string; url: string };

/** The photos of one of your own listings, with ids so they can be removed. */
export async function loadOwnListingPhotos(listingId: string): Promise<OwnPhoto[]> {
  const { data, error } = await supabase.rpc('list_listing_media', { p_listing_ids: [listingId] });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ id: string; path: string }>).map((row) => ({
    id: row.id,
    url: supabase.storage.from(BUCKET).getPublicUrl(row.path).data.publicUrl,
  }));
}

/** Removes a photo: the row first (which checks you own it), then the stored file. */
export async function removeListingPhoto(mediaId: string): Promise<void> {
  const { data, error } = await supabase.rpc('remove_listing_media', { p_media_id: mediaId });
  if (error) throw new Error(error.message);
  if (typeof data === 'string' && data) await supabase.storage.from(BUCKET).remove([data]);
}

export type MyListing = { id: string; headline: string; status: string };

/** Your own listings, newest first, whatever their status. */
export async function loadMyListings(workerId: string): Promise<MyListing[]> {
  const { data, error } = await supabase
    .from('worker_service_listings')
    .select('id,headline,status')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data as MyListing[];
}

export type ListingCardInfo = {
  workerName: string | null;
  rating: number | null;
  reviewCount: number;
  verified: boolean;
  jobsDone: number;
};

/** Who offers each listing and how they are rated (public, for the Services cards). */
export async function loadListingCards(listingIds: string[]): Promise<Record<string, ListingCardInfo>> {
  if (listingIds.length === 0) return {};
  const { data, error } = await supabase.rpc('listing_card_info', { p_listing_ids: listingIds });
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, ListingCardInfo> = {};
  for (const row of data as Array<{
    listing_id: string;
    worker_name: string | null;
    rating: number | string | null;
    review_count: number | null;
    verified: boolean | null;
    jobs_done: number | null;
  }>) {
    out[row.listing_id] = {
      workerName: row.worker_name,
      rating: row.rating == null ? null : Number(row.rating),
      reviewCount: row.review_count ?? 0,
      verified: !!row.verified,
      jobsDone: row.jobs_done ?? 0,
    };
  }
  return out;
}
