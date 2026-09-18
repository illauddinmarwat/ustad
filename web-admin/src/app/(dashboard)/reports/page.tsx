'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatPkr, StatCard } from '@/components/StatCard';
import { supabase } from '@/lib/supabaseClient';
import type { MonthlyEarningsRow, ReportsSummary, TopWorkerRow } from '@/lib/types';

function pctChange(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? '+100%' : '±0%';
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyEarningsRow[]>([]);
  const [topWorkers, setTopWorkers] = useState<TopWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [summaryRes, monthlyRes, topRes] = await Promise.all([
        supabase.rpc('admin_reports_summary', { p_days: 30 }).maybeSingle(),
        supabase.rpc('admin_monthly_earnings', { p_months: 6 }),
        supabase.rpc('admin_top_workers', { p_limit: 5 }),
      ]);
      setSummary((summaryRes.data as ReportsSummary) ?? null);
      setMonthly((monthlyRes.data ?? []) as MonthlyEarningsRow[]);
      setTopWorkers((topRes.data ?? []) as TopWorkerRow[]);
      setLoading(false);
    })();
  }, []);

  const chartData = monthly.map((m) => ({
    month: new Date(m.month_start).toLocaleDateString('en-US', { month: 'short' }),
    total: m.total_pkr,
  }));

  const downloadReport = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total earnings (30d)', String(summary?.total_earnings ?? 0)],
      ['New customers (30d)', String(summary?.new_customers ?? 0)],
      ['Avg commission %', String(summary?.avg_commission_pct ?? 0)],
      ['Active Ustads', String(summary?.active_workers ?? 0)],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ustad-reports-summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-strong">Reports &amp; Analytics</h1>
        <button
          onClick={downloadReport}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-deep"
        >
          Download Report
        </button>
      </div>
      <p className="mb-6 text-sm text-ink-muted">Performance, earnings and growth analytics — last 30 days</p>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon="💵"
          label="Total Earnings"
          value={summary ? formatPkr(summary.total_earnings) : '—'}
          sublabel={summary ? `${pctChange(summary.total_earnings, summary.prev_total_earnings)} vs prev 30d` : undefined}
        />
        <StatCard
          icon="👥"
          label="New Customers"
          value={summary ? String(summary.new_customers) : '—'}
          sublabel={summary ? `${pctChange(summary.new_customers, summary.prev_new_customers)} vs prev 30d` : undefined}
        />
        <StatCard
          icon="📈"
          label="Avg Commission"
          value={summary ? `${summary.avg_commission_pct.toFixed(1)}%` : '—'}
        />
        <StatCard icon="🧑‍🔧" label="Active Ustads" value={summary ? String(summary.active_workers) : '—'} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl2 border border-border bg-surface p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-semibold text-ink-strong">Monthly Earnings — last 6 months</div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCEFE1" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatPkr(v)} />
                <Bar dataKey="total" fill="#15803D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-10 text-center text-sm text-ink-muted">{loading ? 'Loading…' : 'No data yet.'}</div>
          )}
        </div>

        <div className="rounded-xl2 border border-border bg-surface p-5">
          <div className="mb-4 text-sm font-semibold text-ink-strong">Top Performing Ustads</div>
          {topWorkers.length === 0 ? (
            <div className="text-sm text-ink-muted">{loading ? 'Loading…' : 'No paid jobs yet.'}</div>
          ) : (
            <ul className="space-y-3">
              {topWorkers.map((w, idx) => (
                <li key={w.worker_id} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-deep">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-strong">{w.display_name ?? '—'}</div>
                    <div className="text-xs text-ink-muted">
                      {w.avg_rating != null ? `★ ${w.avg_rating.toFixed(1)} · ` : ''}
                      {w.total_jobs_paid} jobs
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-ink-strong">{formatPkr(w.total_earnings)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
