import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StringId } from '../i18n/strings';

import { supabase } from './supabase';
import type { Lang } from './i18nText';

/**
 * "Help me write": the app asks the `ai-draft` Edge Function, which holds the AI key. The AI only drafts;
 * the author reviews and approves both languages before anything is posted. Server flag:
 * `app_settings.ai_help_enabled`. See docs/wizard-ai-plan.md (Phase 3).
 */

export type Kind = 'job' | 'listing';
export type Bilingual = { en: string; ur: string };
export type AiQuestion = { id: string; text: string; options: string[] };
export type JobDraft = { source: Lang; category: string | null; title: Bilingual; description: Bilingual };
export type ListingDraft = { source: Lang; headline: Bilingual; about: Bilingual };
export type QA = { question: string; answer: string };

export type AiErrorCode = 'bad_request' | 'contact' | 'disabled' | 'limit' | 'ai_failed' | 'blocked';
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiErrorCode };

let flagCache: { value: boolean; at: number } | null = null;

export async function fetchAiHelpEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.value;
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'ai_help_enabled').maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const value = !error && (raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true'));
    flagCache = { value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

/** Test hook: forget the cached flag. */
export function resetAiFlagCache(): void {
  flagCache = null;
}

const DEVICE_KEY = 'ustad.deviceId';

/** A random id kept on the phone, so a guest's daily allowance follows the device and not only the network. */
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return '';
  }
}

const CODES: AiErrorCode[] = ['bad_request', 'contact', 'disabled', 'limit', 'ai_failed', 'blocked'];

async function callAi<T>(body: Record<string, unknown>, pick: (data: Record<string, unknown>) => T): Promise<AiResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-draft', {
      body,
      headers: { 'x-device-id': await getDeviceId() },
    });
    if (error || !data || typeof data !== 'object') return { ok: false, error: 'ai_failed' };
    const res = data as { ok?: boolean; error?: string; data?: Record<string, unknown> };
    if (res.ok && res.data) return { ok: true, data: pick(res.data) };
    return { ok: false, error: CODES.includes(res.error as AiErrorCode) ? (res.error as AiErrorCode) : 'ai_failed' };
  } catch {
    return { ok: false, error: 'ai_failed' };
  }
}

export type AiInput = { kind: Kind; lang: Lang; text: string; categories?: string[]; answers?: QA[] };

export function askQuestions(input: AiInput): Promise<AiResult<AiQuestion[]>> {
  return callAi({ action: 'questions', ...input }, (d) => (d.questions as AiQuestion[]) ?? []);
}

export function makeJobDraft(input: Omit<AiInput, 'kind'>): Promise<AiResult<JobDraft>> {
  return callAi({ action: 'draft', kind: 'job', ...input }, (d) => d.draft as JobDraft);
}

export function makeListingDraft(input: Omit<AiInput, 'kind'>): Promise<AiResult<ListingDraft>> {
  return callAi({ action: 'draft', kind: 'listing', ...input }, (d) => d.draft as ListingDraft);
}

/** Translate fields (title, description, headline, about) from one language into the other. */
export function translateFields(
  kind: Kind,
  from: Lang,
  fields: Record<string, string>,
): Promise<AiResult<Record<string, string>>> {
  return callAi({ action: 'translate', kind, from, fields }, (d) => d.fields as Record<string, string>);
}

export const AI_ERROR_STRING: Record<AiErrorCode, StringId> = {
  bad_request: 'ai.error.failed',
  contact: 'ai.error.contact',
  disabled: 'ai.error.disabled',
  limit: 'ai.error.limit',
  ai_failed: 'ai.error.failed',
  blocked: 'ai.error.blocked',
};
