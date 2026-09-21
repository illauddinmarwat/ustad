'use client';

import { useCallback, useEffect, useState } from 'react';

import { formatPkr } from '@/components/StatCard';
import { supabase } from '@/lib/supabaseClient';
import type { CommissionBalanceRow, CommissionRow } from '@/lib/types';

const METHODS = ['cash', 'bank', 'easypaisa', 'jazzcash', 'other'];

export default function HisabPage() {
  const [balances, setBalances] = useState<CommissionBalanceRow[]>([]);
  const [selected, setSelected] = useState<CommissionBalanceRow | null>(null);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; mode: 'settle' | 'waive' } | null>(null);
  const [method, setMethod] = useState('cash');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_commission_balances', { p_limit: 100 });
    if (e) setError(e.message);
    else setBalances((data ?? []) as CommissionBalanceRow[]);
    setLoading(false);
  }, []);

  const loadRows = useCallback(async (workerId: string) => {
    const { data, error: e } = await supabase.rpc('admin_list_commissions', {
      p_worker_id: workerId,
      p_status: null,
      p_limit: 200,
    });
    if (e) setError(e.message);
    else setRows((data ?? []) as CommissionRow[]);
  }, []);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const open = (b: CommissionBalanceRow) => {
    setSelected(b);
    setActing(null);
    setRows([]);
    loadRows(b.worker_id);
  };

  const submit = async () => {
    if (!acting) return;
    setBusy(true);
    setError(null);
    const { error: e } =
      acting.mode === 'settle'
        ? await supabase.rpc('admin_record_commission_settlement', {
            p_ledger_id: acting.id,
            p_method: method,
            p_ref: ref || null,
            p_note: note || null,
          })
        : await supabase.rpc('admin_waive_commission', { p_ledger_id: acting.id, p_reason: note });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setActing(null);
    setRef('');
    setNote('');
    await loadBalances();
    if (selected) await loadRows(selected.worker_id);
  };

  const exportCsv = () => {
    const header = 'Worker,Job,Order amount,Commission %,Commission,Due date,Status,Settled at,Method,Reference,Note\n';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = rows
      .map((r) =>
        [
          r.worker_name,
          r.job_title,
          r.order_amount_pkr,
          r.commission_pct,
          r.commission_pkr,
          r.due_date,
          r.ledger_status,
          r.settled_at ?? '',
          r.settlement_method ?? '',
          r.settlement_ref ?? '',
          r.note ?? '',
        ]
          .map(esc)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hisab-${selected?.worker_name ?? 'worker'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = balances.reduce((s, b) => s + Number(b.outstanding_pkr), 0);
  const overdue = balances.reduce(
    (s, b) => s + Number(b.overdue_1_7_pkr) + Number(b.overdue_8_30_pkr) + Number(b.overdue_30_plus_pkr),
    0
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Hisab — worker dues</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Commission each worker owes Ustad from cash jobs. Overdue rows warn the worker and eventually deactivate the account.
      </p>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-xs text-ink-muted">Outstanding</div>
          <div className="text-xl font-bold text-ink-strong">{formatPkr(total)}</div>
        </div>
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-xs text-ink-muted">Overdue</div>
          <div className="text-xl font-bold text-danger">{formatPkr(overdue)}</div>
        </div>
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-xs text-ink-muted">Workers owing</div>
          <div className="text-xl font-bold text-ink-strong">{balances.length}</div>
        </div>
      </div>

      <div className="mb-8 overflow-x-auto rounded-xl2 border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-3">Worker</th>
              <th className="px-4 py-3">Outstanding</th>
              <th className="px-4 py-3">Not yet due</th>
              <th className="px-4 py-3">1–7 days late</th>
              <th className="px-4 py-3">8–30 days late</th>
              <th className="px-4 py-3">30+ days late</th>
              <th className="px-4 py-3">Oldest due</th>
              <th className="px-4 py-3">Account</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3 text-ink-muted" colSpan={8}>Loading…</td></tr>
            ) : balances.length === 0 ? (
              <tr><td className="px-4 py-3 text-ink-muted" colSpan={8}>No worker owes commission right now.</td></tr>
            ) : (
              balances.map((b) => (
                <tr
                  key={b.worker_id}
                  onClick={() => open(b)}
                  className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-surfaceAlt ${selected?.worker_id === b.worker_id ? 'bg-surfaceAlt' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-ink-strong">{b.worker_name ?? 'Worker'}<div className="text-xs text-ink-muted">{b.city}</div></td>
                  <td className="px-4 py-3">{formatPkr(b.outstanding_pkr)}</td>
                  <td className="px-4 py-3">{formatPkr(b.not_yet_due_pkr)}</td>
                  <td className="px-4 py-3">{formatPkr(b.overdue_1_7_pkr)}</td>
                  <td className="px-4 py-3 text-warning">{formatPkr(b.overdue_8_30_pkr)}</td>
                  <td className="px-4 py-3 font-semibold text-danger">{formatPkr(b.overdue_30_plus_pkr)}</td>
                  <td className="px-4 py-3">{b.oldest_due_date ?? '—'}</td>
                  <td className="px-4 py-3">
                    {b.account_deactivated ? (
                      <span className="rounded-full bg-danger/10 px-2 py-1 text-xs font-medium text-danger">Deactivated</span>
                    ) : (
                      <span className="text-xs text-ink-muted">Active</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="rounded-xl2 border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="text-sm font-semibold text-ink-strong">{selected.worker_name} — commission rows</div>
            <button onClick={exportCsv} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surfaceAlt">
              Export CSV
            </button>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="border-b border-border px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-ink-strong">{r.job_title}</div>
                  <div className="text-xs text-ink-muted">
                    Order {formatPkr(r.order_amount_pkr)} × {r.commission_pct}% = {formatPkr(r.commission_pkr)} · due {r.due_date}
                  </div>
                  {r.settled_at ? (
                    <div className="text-xs text-ink-muted">
                      Settled {new Date(r.settled_at).toLocaleDateString()} via {r.settlement_method}
                      {r.settlement_ref ? ` (${r.settlement_ref})` : ''}
                    </div>
                  ) : null}
                  {r.note ? <div className="text-xs text-ink-muted">Note: {r.note}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-medium capitalize">{r.ledger_status}</span>
                  {r.ledger_status === 'due' || r.ledger_status === 'overdue' ? (
                    <>
                      <button
                        onClick={() => { setActing({ id: r.id, mode: 'settle' }); setNote(''); setRef(''); }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Record payment
                      </button>
                      <button
                        onClick={() => { setActing({ id: r.id, mode: 'waive' }); setNote(''); }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                      >
                        Waive
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {acting?.id === r.id ? (
                <div className="mt-3 space-y-2">
                  {acting.mode === 'settle' ? (
                    <div className="flex flex-wrap gap-2">
                      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-border px-2 py-1.5 text-sm">
                        {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input
                        value={ref}
                        onChange={(e) => setRef(e.target.value)}
                        placeholder="Reference (optional)"
                        className="rounded-lg border border-border px-2 py-1.5 text-sm"
                      />
                    </div>
                  ) : null}
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={acting.mode === 'waive' ? 'Reason (required)' : 'Note (optional)'}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy || (acting.mode === 'waive' && !note.trim())}
                      onClick={submit}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button onClick={() => setActing(null)} className="px-3 py-1.5 text-sm text-ink-muted">Cancel</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
