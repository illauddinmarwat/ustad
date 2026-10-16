'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

type ReportRow = {
  id: string;
  status: 'open' | 'resolved' | 'dismissed';
  reason: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  job_id: string | null;
  job_title: string | null;
  reporter_id: string;
  reporter_name: string | null;
  reported_user_id: string | null;
  reported_name: string | null;
  reported_status: string | null;
  reported_total: number;
};

const REASON_LABELS: Record<string, string> = {
  scam: 'Scam or asking for money upfront',
  abuse: 'Rude, abusive or threatening',
  fake: 'Fake profile or wrong details',
  contact: 'Sharing phone or links to go off the app',
  unsafe: 'Unsafe or inappropriate content',
  other: 'Something else',
};

/** Reports are stored as "code" or "code: the person's own words". */
function splitReason(reason: string): { label: string; note: string } {
  const i = reason.indexOf(':');
  const code = (i === -1 ? reason : reason.slice(0, i)).trim();
  const note = i === -1 ? '' : reason.slice(i + 1).trim();
  return { label: REASON_LABELS[code] ?? reason, note: REASON_LABELS[code] ? note : '' };
}

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
] as const;

export default function AbuseReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('open');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('admin_list_abuse_reports', { p_status: tab, p_limit: 200 });
    if (e) setError(e.message);
    else setRows((data ?? []) as ReportRow[]);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: string, status: 'resolved' | 'dismissed' | 'open') => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_resolve_abuse_report', { p_id: id, p_status: status, p_note: note });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setActing(null);
    setNote('');
    load();
  };

  const suspend = async (userId: string) => {
    if (!window.confirm('Suspend this person? They will not be able to use the app until you activate them again.')) return;
    setError(null);
    const { error: e } = await supabase.rpc('admin_set_user_status', { p_user_id: userId, p_status: 'suspended' });
    if (e) setError(e.message);
    else load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">User reports</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Problems reported from chats, job pages and listings. Review each one, then resolve it (action taken) or dismiss it
        (nothing wrong). Suspending someone is also available here; reactivate them from the Users page.
      </p>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? 'bg-primary text-white' : 'border border-border hover:bg-surfaceAlt'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="rounded-xl2 border border-border bg-surface">
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No reports here.</div> : null}
        {rows.map((r) => {
          const { label, note: userNote } = splitReason(r.reason);
          return (
            <div key={r.id} className="border-b border-border px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-ink-strong">{label}</div>
                  {userNote ? <div className="mt-1 text-sm text-ink-body">&ldquo;{userNote}&rdquo;</div> : null}
                  <div className="mt-1 text-xs text-ink-muted">
                    Reported by {r.reporter_name ?? 'unknown'} ·{' '}
                    {r.reported_user_id
                      ? `about ${r.reported_name ?? 'a user'}${r.reported_status === 'suspended' ? ' (suspended)' : ''}${
                          r.reported_total > 1 ? ` · ${r.reported_total} reports against them` : ''
                        }`
                      : 'about the other person on the job (no account)'}
                    {r.job_title ? ` · job: ${r.job_title}` : ''} · {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.status !== 'open' ? (
                    <div className="mt-1 text-xs text-ink-muted">
                      {r.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                      {r.resolved_at ? ` ${new Date(r.resolved_at).toLocaleString()}` : ''}
                      {r.admin_note ? ` · note: ${r.admin_note}` : ''}
                    </div>
                  ) : null}
                </div>
                {acting === r.id ? null : (
                  <div className="flex gap-2">
                    {r.status === 'open' ? (
                      <button
                        onClick={() => { setActing(r.id); setNote(''); setError(null); }}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surfaceAlt"
                      >
                        Review
                      </button>
                    ) : (
                      <button onClick={() => resolve(r.id, 'open')} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surfaceAlt">
                        Reopen
                      </button>
                    )}
                    {r.reported_user_id && r.reported_status !== 'suspended' ? (
                      <button onClick={() => suspend(r.reported_user_id!)} className="rounded-lg border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger-soft">
                        Suspend user
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              {acting === r.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note for the record (optional)"
                    className="min-w-[16rem] flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  <button disabled={busy} onClick={() => resolve(r.id, 'resolved')} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    Resolve
                  </button>
                  <button disabled={busy} onClick={() => resolve(r.id, 'dismissed')} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50">
                    Dismiss
                  </button>
                  <button onClick={() => setActing(null)} className="px-3 py-1.5 text-sm text-ink-muted">Cancel</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
