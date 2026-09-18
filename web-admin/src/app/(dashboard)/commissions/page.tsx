'use client';

import { useEffect, useState } from 'react';

import { formatPkr, StatCard } from '@/components/StatCard';
import { supabase } from '@/lib/supabaseClient';
import type { CommissionSummary, WorkerCommissionRow } from '@/lib/types';

export default function CommissionsPage() {
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [rows, setRows] = useState<WorkerCommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [summaryRes, breakdownRes] = await Promise.all([
        supabase.rpc('admin_commission_summary').maybeSingle(),
        supabase.rpc('admin_worker_commission_breakdown', { p_limit: 20 }),
      ]);
      if (summaryRes.error) setError(summaryRes.error.message);
      else setSummary(summaryRes.data as CommissionSummary);
      setRows((breakdownRes.data ?? []) as WorkerCommissionRow[]);
      setLoading(false);
    })();
  }, []);

  const exportCsv = () => {
    const header = 'Ustad Name,City,Total Jobs,Total Commission,Net Paid to Ustad\n';
    const body = rows
      .map((r) => `${r.display_name ?? ''},${r.city ?? ''},${r.total_jobs},${r.total_commission},${r.net_paid}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ustad-commission-breakdown.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Commission Dashboard</h1>
      <p className="mb-6 text-sm text-ink-muted">Track commissions and payments for all Ustads</p>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon="💰" label="Total Earnings" value={summary ? formatPkr(summary.total_earnings) : '—'} />
        <StatCard
          icon="%"
          label="Total Commission"
          value={summary ? formatPkr(summary.total_commission) : '—'}
          sublabel="From all paid jobs"
        />
        <StatCard
          icon="🏦"
          label="Total Paid to Ustads"
          value={summary ? formatPkr(summary.total_paid_to_workers) : '—'}
          sublabel="Net disbursed"
        />
        <StatCard icon="📋" label="Jobs Paid" value={summary ? String(summary.total_jobs_paid) : '—'} />
      </div>

      <div className="rounded-xl2 border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-ink-strong">Ustad Commission Details</div>
            <div className="text-xs text-ink-muted">{rows.length} Ustads with paid jobs</div>
          </div>
          <button
            onClick={exportCsv}
            className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft"
          >
            Export to CSV
          </button>
        </div>

        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No paid jobs yet.</div> : null}

        {rows.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th className="px-5 py-3 font-medium">Ustad Name</th>
                <th className="px-5 py-3 font-medium">Total Jobs</th>
                <th className="px-5 py-3 font-medium">Total Commission</th>
                <th className="px-5 py-3 font-medium">Net Paid to Ustad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.worker_id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink-strong">{r.display_name ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{r.city ?? ''}</div>
                  </td>
                  <td className="px-5 py-3 text-ink-body">{r.total_jobs}</td>
                  <td className="px-5 py-3 text-ink-body">{formatPkr(r.total_commission)}</td>
                  <td className="px-5 py-3 font-medium text-primary-deep">{formatPkr(r.net_paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
