'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

type ErrorRow = {
  message: string;
  occurrences: number;
  users: number;
  fatal: boolean;
  platform: string | null;
  app_version: string | null;
  first_seen: string;
  last_seen: string;
  sample_stack: string | null;
};

const RANGES = [1, 7, 30] as const;

export default function AppErrorsPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('admin_list_client_errors', { p_days: days });
    if (e) setError(e.message);
    else setRows((data ?? []) as ErrorRow[]);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">App errors</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Crashes and unexpected errors reported by the mobile app, grouped by message. Kept for 30 days. A message with many
        users is the one to fix first.
      </p>

      <div className="mb-4 flex gap-2">
        {RANGES.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${days === d ? 'bg-primary text-white' : 'border border-border hover:bg-surfaceAlt'}`}
          >
            {d === 1 ? 'Last 24 hours' : `Last ${d} days`}
          </button>
        ))}
        <button onClick={load} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surfaceAlt">Refresh</button>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="rounded-xl2 border border-border bg-surface">
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No errors in this period.</div> : null}
        {rows.map((r) => (
          <div key={r.message} className="border-b border-border px-5 py-4 last:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="break-words text-sm font-semibold text-ink-strong">
                  {r.fatal ? <span className="mr-2 rounded bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">crash</span> : null}
                  {r.message}
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {r.occurrences}× · {r.users} signed-in user{r.users === 1 ? '' : 's'} · {r.platform ?? 'unknown'}
                  {r.app_version ? ` · v${r.app_version}` : ''} · last {new Date(r.last_seen).toLocaleString()}
                </div>
              </div>
              {r.sample_stack ? (
                <button onClick={() => setOpen(open === r.message ? null : r.message)} className="text-xs font-medium text-primary hover:underline">
                  {open === r.message ? 'Hide details' : 'Show details'}
                </button>
              ) : null}
            </div>
            {open === r.message && r.sample_stack ? (
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-surfaceAlt p-3 text-xs text-ink-body">{r.sample_stack}</pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
