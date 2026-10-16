import type { StringId } from '../i18n/strings';
import { supabase } from './supabase';

export const REPORT_REASONS = [
  { code: 'scam', labelId: 'report.reason.scam' },
  { code: 'abuse', labelId: 'report.reason.abuse' },
  { code: 'fake', labelId: 'report.reason.fake' },
  { code: 'contact', labelId: 'report.reason.contact' },
  { code: 'unsafe', labelId: 'report.reason.unsafe' },
  { code: 'other', labelId: 'report.reason.other' },
] as const satisfies ReadonlyArray<{ code: string; labelId: StringId }>;

export type ReportReason = (typeof REPORT_REASONS)[number]['code'];

const MAX_NOTE = 500;

/** The text stored in abuse_reports.reason: a stable code the admin can filter on, then the person's own words. */
export function buildReportReason(code: ReportReason, note: string): string {
  const trimmed = note.trim().slice(0, MAX_NOTE);
  return trimmed ? `${code}: ${trimmed}` : code;
}

export type ReportTarget = {
  reporterId: string;
  reportedUserId?: string | null;
  jobId?: string | null;
};

export async function submitReport(target: ReportTarget, code: ReportReason, note: string): Promise<void> {
  const { error } = await supabase.from('abuse_reports').insert({
    reporter_id: target.reporterId,
    reported_user_id: target.reportedUserId ?? null,
    job_id: target.jobId ?? null,
    reason: buildReportReason(code, note),
  });
  if (error) throw new Error(error.message);
}
