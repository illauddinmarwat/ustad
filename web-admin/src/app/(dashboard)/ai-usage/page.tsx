'use client';

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import type { AiUsageRow } from '@/lib/types';

const DAYS = [7, 14, 30];

export default function AiUsagePage() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<AiUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('admin_ai_usage', { p_days: days });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setRows(((data ?? []) as AiUsageRow[]).map((r) => ({ ...r, calls: Number(r.calls), failed: Number(r.failed), tokens_in: Number(r.tokens_in), tokens_out: Number(r.tokens_out), people: Number(r.people) })));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const total = rows.reduce(
    (t, r) => ({ calls: t.calls + r.calls, failed: t.failed + r.failed, tokens: t.tokens + r.tokens_in + r.tokens_out }),
    { calls: 0, failed: 0, tokens: 0 },
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink-strong">AI Usage</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Calls to Help me write: questions, drafts and translations. Only counts are kept, never the text people wrote or the AI answered.
        Turn it on and set the daily limits in Settings.
      </p>

      <div className="mb-4 flex items-center gap-2">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`rounded-full border px-3 py-1 text-sm ${days === d ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink-body'}`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-xs text-ink-muted">Calls</div>
          <div className="text-2xl font-bold text-ink-strong">{total.calls}</div>
        </div>
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-xs text-ink-muted">Failed</div>
          <div className="text-2xl font-bold text-ink-strong">{total.failed}</div>
        </div>
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-xs text-ink-muted">Tokens</div>
          <div className="text-2xl font-bold text-ink-strong">{total.tokens.toLocaleString()}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl2 border border-border bg-surface">
        {error ? <div className="p-5 text-sm text-danger">{error}</div> : null}
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && !error && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No AI calls in this period.</div> : null}
        {rows.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2">Day</th>
                <th className="px-4 py-2">Calls</th>
                <th className="px-4 py-2">Failed</th>
                <th className="px-4 py-2">People</th>
                <th className="px-4 py-2">Tokens in</th>
                <th className="px-4 py-2">Tokens out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{r.day}</td>
                  <td className="px-4 py-2">{r.calls}</td>
                  <td className={`px-4 py-2 ${r.failed > 0 ? 'text-danger' : ''}`}>{r.failed}</td>
                  <td className="px-4 py-2">{r.people}</td>
                  <td className="px-4 py-2">{r.tokens_in.toLocaleString()}</td>
                  <td className="px-4 py-2">{r.tokens_out.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
