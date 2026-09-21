'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import type { FunnelRow, JobEventRow } from '@/lib/types';

const KIND_LABEL: Record<JobEventRow['kind'], string> = {
  accepted: 'Worker accepted',
  payment_pending: 'Customer marked paid',
  closed: 'Job closed',
  disputed: 'Payment disputed',
  dispute_resolved: 'Dispute resolved',
  moderated: 'Closed by admin',
};

const KIND_STYLE: Record<JobEventRow['kind'], string> = {
  accepted: 'bg-primary/10 text-primary-deep',
  payment_pending: 'bg-warning/15 text-ink-strong',
  closed: 'bg-primary/10 text-primary-deep',
  disputed: 'bg-danger/10 text-danger',
  dispute_resolved: 'bg-surfaceAlt text-ink-body',
  moderated: 'bg-danger/10 text-danger',
};

export default function JobsFeedPage() {
  const [rows, setRows] = useState<JobEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyDisputes, setOnlyDisputes] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc('admin_list_job_events', { p_limit: 100 });
    if (loadError) setError(loadError.message);
    else setRows((data ?? []) as JobEventRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.rpc('admin_jobs_funnel', { p_days: 30 }).then(({ data }) => setFunnel((data ?? []) as FunnelRow[]));
  }, [load]);

  const resolve = async (jobId: string, ledgerStatus: 'paid' | 'refunded') => {
    if (!note.trim()) {
      setError('Add a note describing what was agreed on the helpline call.');
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('admin_resolve_job_dispute', {
      p_job_id: jobId,
      p_ledger_status: ledgerStatus,
      p_note: note.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setResolving(null);
    setNote('');
    load();
  };

  const visible = onlyDisputes ? rows.filter((r) => r.job_status === 'disputed') : rows;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink-strong">Job Activity</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Accepted jobs, cash payments and disputes. Disputed jobs need a helpline call, then resolve them here.
      </p>

      <div className="mb-6 overflow-x-auto rounded-xl2 border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink-strong">Last 30 days by flow</div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2">Flow</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Accepted</th>
              <th className="px-4 py-2">Work done</th>
              <th className="px-4 py-2">Closed (paid)</th>
              <th className="px-4 py-2">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {funnel.length === 0 ? (
              <tr><td className="px-4 py-3 text-ink-muted" colSpan={6}>No jobs in this period.</td></tr>
            ) : (
              funnel.map((f) => (
                <tr key={f.flow} className="border-t border-border">
                  <td className="px-4 py-2 font-medium capitalize">{f.flow === 'direct' ? 'Direct request' : f.flow === 'posted' ? 'Posted job' : 'Service'}</td>
                  <td className="px-4 py-2">{f.created}</td>
                  <td className="px-4 py-2">{f.assigned_or_later}</td>
                  <td className="px-4 py-2">{f.work_done}</td>
                  <td className="px-4 py-2">{f.closed}</td>
                  <td className="px-4 py-2">{f.cancelled}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-ink-body">
        <input type="checkbox" checked={onlyDisputes} onChange={(e) => setOnlyDisputes(e.target.checked)} />
        Show only jobs currently disputed
      </label>

      <div className="rounded-xl2 border border-border bg-surface">
        {error ? <div className="p-5 text-sm text-danger">{error}</div> : null}
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && visible.length === 0 ? <div className="p-5 text-sm text-ink-muted">No activity yet.</div> : null}

        {visible.map((row) => (
          <div key={row.id} className="border-b border-border px-5 py-4 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-ink-strong">{row.job_title}</div>
                <div className="text-xs text-ink-muted">
                  {row.customer_name ?? 'Customer'} → {row.worker_name ?? 'Worker'} · status {row.job_status}
                </div>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${KIND_STYLE[row.kind]}`}>
                  {KIND_LABEL[row.kind]}
                </span>
                <div className="mt-1 text-xs text-ink-muted">{new Date(row.created_at).toLocaleString()}</div>
              </div>
            </div>

            {row.kind === 'dispute_resolved' && typeof row.detail?.note === 'string' ? (
              <div className="mt-2 text-xs text-ink-muted">Note: {row.detail.note}</div>
            ) : null}
            {row.kind === 'moderated' && typeof row.detail?.reason === 'string' ? (
              <div className="mt-2 text-xs text-ink-muted">Reason: {row.detail.reason}</div>
            ) : null}

            {row.job_status === 'disputed' && row.kind === 'disputed' ? (
              resolving === row.job_id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was agreed on the helpline call?"
                    className="w-full rounded-lg border border-border p-2 text-sm"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => resolve(row.job_id, 'paid')}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Payment was made — close job
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => resolve(row.job_id, 'refunded')}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-body disabled:opacity-50"
                    >
                      Refunded — close job
                    </button>
                    <button onClick={() => setResolving(null)} className="px-3 py-1.5 text-sm text-ink-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setResolving(row.job_id);
                    setNote('');
                    setError(null);
                  }}
                  className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-body hover:bg-surfaceAlt"
                >
                  Resolve dispute
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
