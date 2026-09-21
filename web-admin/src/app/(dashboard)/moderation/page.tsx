'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import type { PostedJobRow } from '@/lib/types';

export default function ModerationPage() {
  const [rows, setRows] = useState<PostedJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('admin_list_posted_jobs', { p_limit: 100 });
    if (e) setError(e.message);
    else setRows((data ?? []) as PostedJobRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const close = async (id: string) => {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_close_posted_job', { p_job_id: id, p_reason: reason.trim() });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setClosing(null);
    setReason('');
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Posted jobs</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Open jobs from customers and guests. Close a job that is spam or breaks the rules. To stop an abusive customer, suspend them from the Admin tab in the mobile app; a
        suspended customer can no longer post jobs.
      </p>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="rounded-xl2 border border-border bg-surface">
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No open posted jobs.</div> : null}
        {rows.map((r) => (
          <div key={r.id} className="border-b border-border px-5 py-4 last:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-ink-strong">{r.title}</div>
                <div className="text-xs text-ink-muted">
                  {r.category}
                  {r.city ? ` · ${r.city}` : ''} · {r.is_guest ? 'Guest' : r.customer_name ?? 'Customer'} · {r.quote_count} quotes ·
                  posted {new Date(r.created_at).toLocaleString()}
                </div>
                {r.description ? <div className="mt-1 text-sm text-ink-body">{r.description}</div> : null}
              </div>
              {closing === r.id ? null : (
                <button
                  onClick={() => { setClosing(r.id); setReason(''); setError(null); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surfaceAlt"
                >
                  Close job
                </button>
              )}
            </div>
            {closing === r.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required)"
                  className="min-w-[16rem] flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
                />
                <button
                  disabled={busy}
                  onClick={() => close(r.id)}
                  className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Close it
                </button>
                <button onClick={() => setClosing(null)} className="px-3 py-1.5 text-sm text-ink-muted">Cancel</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
