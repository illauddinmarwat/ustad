'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatPkr } from '@/components/StatCard';
import { colorForCategory } from '@/components/WorkerMap';
import { supabase } from '@/lib/supabaseClient';
import type {
  BreakdownRow,
  DashboardCounts,
  DashboardKpis,
  FunnelRow,
  JobEventRow,
  MapWorker,
  MonthlyEarningsRow,
  TopWorkerRow,
  WorkerApprovalRow,
} from '@/lib/types';
import { useAdminAuth } from '@/lib/useAdminAuth';

// Leaflet touches `window`, so the map is client-only and loaded on demand.
const WorkerMap = dynamic(() => import('@/components/WorkerMap').then((m) => m.WorkerMap), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center text-sm text-ink-muted">Loading map…</div>,
});

type Period = 7 | 30 | 90;

type Loaded<T> = { data: T; error: string | null; loading: boolean };

const KIND_LABEL: Record<JobEventRow['kind'], string> = {
  accepted: 'Worker accepted',
  payment_pending: 'Customer marked paid',
  closed: 'Job closed',
  disputed: 'Payment disputed',
  dispute_resolved: 'Dispute resolved',
  moderated: 'Closed by admin',
};

/** Runs one query on mount and whenever `key` changes; a failure only affects its own section. */
function useQuery<T>(fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, initial: T, key: unknown): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: initial, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(fn()).then(
      ({ data, error }) => {
        if (!live) return;
        setState(error ? { data: initial, error: error.message, loading: false } : { data: (data ?? initial) as T, error: null, loading: false });
      },
      (e: unknown) => live && setState({ data: initial, error: e instanceof Error ? e.message : 'Failed to load', loading: false })
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

function pct(current: number, prev: number): { text: string; up: boolean | null } {
  if (prev === 0) return current > 0 ? { text: 'new', up: true } : { text: '—', up: null };
  const p = ((current - prev) / prev) * 100;
  return { text: `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`, up: p === 0 ? null : p > 0 };
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { displayName } = useAdminAuth();
  const [period, setPeriod] = useState<Period>(30);
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [cityFilter, setCityFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const lastRefresh = useRef(Date.now());

  const refresh = useCallback(() => {
    lastRefresh.current = Date.now();
    setTick((t) => t + 1);
  }, []);

  // Refresh when the admin comes back to this tab (at most once a minute).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 60_000) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const counts = useQuery<DashboardCounts | null>(() => supabase.rpc('admin_dashboard_counts').maybeSingle(), null, tick);
  const kpis = useQuery<DashboardKpis | null>(() => supabase.rpc('admin_kpis', { p_days: period }).maybeSingle(), null, `${tick}-${period}`);
  const monthly = useQuery<MonthlyEarningsRow[]>(() => supabase.rpc('admin_monthly_earnings', { p_months: 6 }), [], tick);
  const funnel = useQuery<FunnelRow[]>(() => supabase.rpc('admin_jobs_funnel', { p_days: period }), [], `${tick}-${period}`);
  const top = useQuery<TopWorkerRow[]>(() => supabase.rpc('admin_top_workers', { p_limit: 5 }), [], tick);
  const breakdown = useQuery<BreakdownRow[]>(() => supabase.rpc('admin_breakdown', { p_days: period }), [], `${tick}-${period}`);
  const mapData = useQuery<MapWorker[]>(() => supabase.rpc('admin_worker_map'), [], tick);
  const regs = useQuery<WorkerApprovalRow[]>(() => supabase.rpc('admin_list_worker_approvals', { p_status: null }), [], tick);
  const events = useQuery<JobEventRow[]>(() => supabase.rpc('admin_list_job_events', { p_limit: 8 }), [], tick);
  const cats = useQuery<{ key: string; name_en: string }[]>(
    () => supabase.from('skill_categories').select('key,name_en').order('sort_order'),
    [],
    'cats'
  );

  useEffect(() => {
    if (!counts.loading) setUpdatedAt(new Date());
  }, [counts.loading, tick]);

  const catKeys = useMemo(() => cats.data.map((c) => c.key), [cats.data]);
  const catLabel = useCallback((key: string) => cats.data.find((c) => c.key === key)?.name_en ?? key, [cats.data]);

  const pending = useMemo(
    () => regs.data.filter((r) => r.approval_status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 5),
    [regs.data]
  );
  const latest = useMemo(() => regs.data.slice(0, 8), [regs.data]);

  const mapCities = useMemo(() => Array.from(new Set(mapData.data.map((w) => w.city).filter(Boolean) as string[])).sort(), [mapData.data]);
  const mapWorkers = useMemo(
    () =>
      mapData.data.filter(
        (w) => (!cityFilter || w.city === cityFilter) && (!catFilter || (w.categories ?? []).includes(catFilter))
      ),
    [mapData.data, cityFilter, catFilter]
  );

  const c = counts.data;
  const k = kpis.data;
  const chartData = monthly.data.map((m) => ({
    month: new Date(m.month_start).toLocaleDateString('en-US', { month: 'short' }),
    total: m.total_pkr,
  }));

  const cityRows = breakdown.data.filter((r) => r.dimension === 'city').sort((a, b) => b.workers + b.jobs - (a.workers + a.jobs)).slice(0, 8);
  const catRows = breakdown.data.filter((r) => r.dimension === 'category').sort((a, b) => b.workers + b.jobs - (a.workers + a.jobs)).slice(0, 8);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      {/* 1. Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-strong">
            {greeting}
            {displayName ? `, ${displayName}` : ''} <span className="text-base font-normal text-ink-muted">· ڈیش بورڈ</span>
          </h1>
          <p className="text-sm text-ink-muted">
            Here is what needs you today and how Ustad is doing.
            {updatedAt ? ` Updated ${updatedAt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border bg-surface p-0.5">
            {([7, 30, 90] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  period === p ? 'bg-primary text-white' : 'text-ink-body hover:bg-surfaceAlt'
                }`}
              >
                {p} days
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-body hover:bg-surfaceAlt"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* 2. Action centre */}
      <SectionTitle title="Needs your attention" urdu="توجہ درکار" />
      {counts.error ? <ErrorNote message={counts.error} /> : null}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <ActionTile href="/approvals" icon="✅" label="Ustads to approve" value={c?.pending_workers} loading={counts.loading} tone="warning" />
        <ActionTile href="/approvals" icon="📍" label="New areas to add" value={c?.new_areas_pending} loading={counts.loading} tone="info" />
        <ActionTile href="/payments" icon="💳" label="Payments to confirm" value={c?.pending_payments} loading={counts.loading} tone="warning" />
        <ActionTile href="/jobs" icon="⚠️" label="Open disputes" value={c?.open_disputes} loading={counts.loading} tone="danger" />
        <ActionTile
          href="/hisab"
          icon="📒"
          label="Overdue dues"
          value={c ? formatPkr(c.overdue_dues_pkr) : undefined}
          zero={c ? c.overdue_dues_pkr === 0 : false}
          loading={counts.loading}
          tone="danger"
        />
        <ActionTile href="/moderation" icon="🛡️" label="Posted jobs open" value={c?.open_posted_jobs} loading={counts.loading} tone="info" />
      </div>

      <Panel title="Oldest registrations waiting" right={<Link href="/approvals" className="text-xs font-semibold text-primary underline">Open Approvals</Link>}>
        {regs.error ? <ErrorNote message={regs.error} /> : null}
        {regs.loading ? <Muted>Loading…</Muted> : null}
        {!regs.loading && pending.length === 0 ? <Muted>Nobody is waiting. All clear 🎉</Muted> : null}
        <ul className="divide-y divide-border">
          {pending.map((r) => (
            <li key={r.user_id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink-strong">{r.display_name ?? '—'}</div>
                <div className="truncate text-xs text-ink-muted">
                  {(r.categories ?? []).map(catLabel).join(', ') || '—'} · {[r.area, r.city].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div className="text-xs text-ink-muted">{timeAgo(r.created_at)}</div>
              <Link href="/approvals" className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-deep">
                Review
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {/* 3. Business overview */}
      <div className="mt-8" />
      <SectionTitle title={`Business overview · last ${period} days`} urdu="کاروبار کا جائزہ" />
      {kpis.error ? <ErrorNote message={kpis.error} /> : null}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Earnings" value={k ? formatPkr(k.earnings_pkr) : '—'} delta={k ? pct(k.earnings_pkr, k.prev_earnings_pkr) : null} loading={kpis.loading} />
        <KpiCard label="Commission" value={k ? formatPkr(k.commission_pkr) : '—'} delta={k ? pct(k.commission_pkr, k.prev_commission_pkr) : null} loading={kpis.loading} />
        <KpiCard label="Jobs completed" value={k ? String(k.jobs_completed) : '—'} delta={k ? pct(k.jobs_completed, k.prev_jobs_completed) : null} loading={kpis.loading} />
        <KpiCard label="New customers" value={k ? String(k.new_customers) : '—'} delta={k ? pct(k.new_customers, k.prev_new_customers) : null} loading={kpis.loading} />
        <KpiCard label="New Ustads" value={k ? String(k.new_workers) : '—'} delta={k ? pct(k.new_workers, k.prev_new_workers) : null} loading={kpis.loading} />
        <KpiCard
          label="Avg rating"
          value={k?.avg_rating != null ? `★ ${k.avg_rating.toFixed(2)}` : '—'}
          delta={k && k.avg_rating != null && k.prev_avg_rating != null ? pct(k.avg_rating, k.prev_avg_rating) : null}
          loading={kpis.loading}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Platform totals" className="lg:col-span-1">
          <TotalRow label="Ustads approved" value={c?.approved_workers} />
          <TotalRow label="Ustads pending" value={c?.pending_workers} />
          <TotalRow label="Ustads rejected" value={c?.rejected_workers} />
          <TotalRow label="Customers" value={c?.customers} />
          <TotalRow label="Active service listings" value={c?.active_listings} />
        </Panel>
        <Panel title="Earnings — last 6 months" className="lg:col-span-2">
          {monthly.error ? <ErrorNote message={monthly.error} /> : null}
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCEFE1" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatPkr(v)} />
                <Bar dataKey="total" fill="#15803D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Muted>{monthly.loading ? 'Loading…' : 'No earnings yet.'}</Muted>
          )}
        </Panel>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Job funnel">
          {funnel.error ? <ErrorNote message={funnel.error} /> : null}
          {funnel.data.length === 0 ? <Muted>{funnel.loading ? 'Loading…' : 'No jobs in this period.'}</Muted> : null}
          <div className="space-y-4">
            {funnel.data.map((f) => (
              <div key={f.flow}>
                <div className="mb-1 text-xs font-semibold capitalize text-ink-body">{f.flow} jobs</div>
                <FunnelBar label="Created" value={f.created} max={f.created} />
                <FunnelBar label="Assigned" value={f.assigned_or_later} max={f.created} />
                <FunnelBar label="Work done" value={f.work_done} max={f.created} />
                <FunnelBar label="Closed" value={f.closed} max={f.created} />
                <div className="text-[11px] text-ink-muted">{f.cancelled} cancelled</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Top Ustads">
          {top.error ? <ErrorNote message={top.error} /> : null}
          {top.data.length === 0 ? <Muted>{top.loading ? 'Loading…' : 'No paid jobs yet.'}</Muted> : null}
          <ul className="space-y-3">
            {top.data.map((w, i) => (
              <li key={w.worker_id} className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-deep">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-strong">{w.display_name ?? '—'}</div>
                  <div className="text-xs text-ink-muted">
                    {w.avg_rating != null ? `★ ${w.avg_rating.toFixed(1)} · ` : ''}
                    {w.total_jobs_paid} jobs
                  </div>
                </div>
                <div className="text-sm font-semibold text-ink-strong">{formatPkr(w.total_earnings)}</div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="By city">
          {breakdown.error ? <ErrorNote message={breakdown.error} /> : null}
          <BreakdownList rows={cityRows} loading={breakdown.loading} label={(s) => s} />
        </Panel>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="By skill" className="lg:col-span-1">
          <BreakdownList rows={catRows} loading={breakdown.loading} label={catLabel} />
        </Panel>
        <Panel title="Data health" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HealthItem label="Overdue 30+ days" value={c?.overdue_30_plus_workers} hint="Ustads" href="/hisab" />
            <HealthItem label="Deactivated (dues)" value={c?.suspended_workers} hint="Ustads" href="/hisab" />
            <HealthItem label="Approved, no location" value={c?.approved_without_location} hint="not on the map" />
            <HealthItem label="Approved, no photo" value={c?.approved_without_photo} hint="profile incomplete" />
          </div>
        </Panel>
      </div>

      {/* 4. Map */}
      <SectionTitle title="Where are the Ustads" urdu="استاد کہاں ہیں" />
      <Panel
        title={`${mapWorkers.length} Ustad${mapWorkers.length === 1 ? '' : 's'} on the map${
          c ? ` · ${c.approved_without_location} approved without a location` : ''
        }`}
        right={
          <div className="flex gap-2">
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">
              <option value="">All cities</option>
              {mapCities.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">
              <option value="">All skills</option>
              {cats.data.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name_en}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {mapData.error ? <ErrorNote message={mapData.error} /> : null}
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-body">
          {cats.data.map((x) => (
            <span key={x.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorForCategory(x.key, catKeys) }} />
              {x.name_en}
            </span>
          ))}
        </div>
        <WorkerMap workers={mapWorkers} categoryKeys={catKeys} categoryLabel={catLabel} />
        {!mapData.loading && mapData.data.length === 0 ? (
          <div className="mt-2 text-xs text-ink-muted">No approved Ustad has a saved location yet. Pins appear once Ustads register with the map pin.</div>
        ) : null}
      </Panel>

      {/* 5. Recent activity */}
      <div className="mt-8" />
      <SectionTitle title="Recent activity" urdu="حالیہ سرگرمی" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Latest registrations" right={<Link href="/approvals" className="text-xs font-semibold text-primary underline">All</Link>}>
          {latest.length === 0 ? <Muted>{regs.loading ? 'Loading…' : 'No registrations yet.'}</Muted> : null}
          <ul className="divide-y divide-border">
            {latest.map((r) => (
              <li key={r.user_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-strong">{r.display_name ?? '—'}</div>
                  <div className="truncate text-xs text-ink-muted">{[r.area, r.city].filter(Boolean).join(', ') || '—'}</div>
                </div>
                <StatusPill status={r.approval_status} />
                <div className="w-14 text-right text-xs text-ink-muted">{timeAgo(r.created_at)}</div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Latest job events" right={<Link href="/jobs" className="text-xs font-semibold text-primary underline">All</Link>}>
          {events.error ? <ErrorNote message={events.error} /> : null}
          {events.data.length === 0 ? <Muted>{events.loading ? 'Loading…' : 'No job activity yet.'}</Muted> : null}
          <ul className="divide-y divide-border">
            {events.data.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-strong">{KIND_LABEL[e.kind] ?? e.kind}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {e.job_title} · {e.customer_name ?? '—'} → {e.worker_name ?? '—'}
                  </div>
                </div>
                <div className="w-14 text-right text-xs text-ink-muted">{timeAgo(e.created_at)}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function SectionTitle({ title, urdu }: { title: string; urdu: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-base font-bold text-ink-strong">{title}</h2>
      <span className="text-xs text-ink-muted">{urdu}</span>
    </div>
  );
}

function Panel({ title, right, className = '', children }: { title: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl2 border border-border bg-surface p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink-strong">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="py-3 text-sm text-ink-muted">{children}</div>;
}

function ErrorNote({ message }: { message: string }) {
  return <div className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">Could not load this section: {message}</div>;
}

function ActionTile({
  href,
  icon,
  label,
  value,
  zero,
  loading,
  tone,
}: {
  href: string;
  icon: string;
  label: string;
  value: number | string | undefined;
  zero?: boolean;
  loading: boolean;
  tone: 'warning' | 'danger' | 'info';
}) {
  const isZero = zero ?? value === 0;
  const accent = isZero ? 'border-border' : tone === 'danger' ? 'border-danger' : tone === 'warning' ? 'border-warning' : 'border-info';
  const bg = isZero ? 'bg-surface' : tone === 'danger' ? 'bg-danger-soft' : tone === 'warning' ? 'bg-warning-soft' : 'bg-info-soft';
  return (
    <Link href={href} className={`block rounded-xl2 border ${accent} ${bg} p-4 transition hover:shadow-md`}>
      <div className="text-lg">{icon}</div>
      <div className="mt-2 text-2xl font-bold text-ink-strong">{loading || value === undefined ? '…' : value}</div>
      <div className="text-xs font-medium text-ink-body">{label}</div>
      {!loading && isZero ? <div className="mt-1 text-[11px] text-primary">All clear</div> : null}
    </Link>
  );
}

function KpiCard({ label, value, delta, loading }: { label: string; value: string; delta: { text: string; up: boolean | null } | null; loading: boolean }) {
  return (
    <div className="rounded-xl2 border border-border bg-surface p-4">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-bold text-ink-strong">{loading ? '…' : value}</div>
      {delta ? (
        <div className={`mt-1 text-xs font-semibold ${delta.up === null ? 'text-ink-muted' : delta.up ? 'text-primary' : 'text-danger'}`}>
          {delta.up === true ? '▲ ' : delta.up === false ? '▼ ' : ''}
          {delta.text} <span className="font-normal text-ink-muted">vs previous</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-ink-muted">&nbsp;</div>
      )}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-ink-body">{label}</span>
      <span className="font-semibold text-ink-strong">{value ?? '…'}</span>
    </div>
  );
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-1 flex items-center gap-2 text-xs">
      <div className="w-16 text-ink-muted">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surfaceAlt">
        <div className="h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
      </div>
      <div className="w-8 text-right font-medium text-ink-strong">{value}</div>
    </div>
  );
}

function BreakdownList({ rows, loading, label }: { rows: BreakdownRow[]; loading: boolean; label: (s: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.workers, r.jobs)));
  if (rows.length === 0) return <Muted>{loading ? 'Loading…' : 'Nothing to show yet.'}</Muted>;
  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-primary" /> Ustads</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-info" /> Jobs</span>
      </div>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-0.5 text-xs font-medium text-ink-body">{label(r.label)}</div>
          <div className="flex items-center gap-2 text-[11px]">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surfaceAlt"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.workers / max) * 100}%` }} /></div>
            <span className="w-6 text-right font-semibold text-ink-strong">{r.workers}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surfaceAlt"><div className="h-full rounded-full bg-info" style={{ width: `${(r.jobs / max) * 100}%` }} /></div>
            <span className="w-6 text-right font-semibold text-ink-strong">{r.jobs}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthItem({ label, value, hint, href }: { label: string; value: number | undefined; hint: string; href?: string }) {
  const body = (
    <div className={`rounded-lg border p-3 ${value ? 'border-warning bg-warning-soft' : 'border-border bg-surfaceAlt'}`}>
      <div className="text-xl font-bold text-ink-strong">{value ?? '…'}</div>
      <div className="text-xs font-medium text-ink-body">{label}</div>
      <div className="text-[11px] text-ink-muted">{hint}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function StatusPill({ status }: { status: WorkerApprovalRow['approval_status'] }) {
  const styles = { approved: 'bg-primary-soft text-primary-deep', pending: 'bg-warning-soft text-amber-800', rejected: 'bg-danger-soft text-red-800' };
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[status]}`}>{status}</span>;
}
