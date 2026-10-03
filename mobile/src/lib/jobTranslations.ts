import type { I18n } from './i18nText';
import { supabase } from './supabase';

export type JobTranslation = { title_i18n: I18n; description_i18n: I18n };

/** The English and Urdu versions of jobs the caller may see, by job id. Jobs without any are absent. */
export async function loadJobTranslations(jobIds: string[]): Promise<Record<string, JobTranslation>> {
  if (jobIds.length === 0) return {};
  const { data, error } = await supabase.rpc('job_translations', { p_job_ids: jobIds });
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, JobTranslation> = {};
  for (const row of data as Array<{ job_id: string } & JobTranslation>) {
    out[row.job_id] = { title_i18n: row.title_i18n ?? null, description_i18n: row.description_i18n ?? null };
  }
  return out;
}
