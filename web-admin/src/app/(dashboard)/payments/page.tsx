'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatPkr } from '@/components/StatCard';
import { supabase } from '@/lib/supabaseClient';
import type { PaymentRow, ProfileLite } from '@/lib/types';

type Tab = 'all' | 'pending' | 'paid';

const METHOD_LABEL: Record<PaymentRow['method'], string> = {
  manual: 'Manual',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  bank: 'Bank transfer',
};

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from('payment_ledger').select('*').order('created_at', { ascending: false }).limit(100);
    if (tab === 'pending') query = query.eq('status', 'pending');
    if (tab === 'paid') query = query.eq('status', 'paid');
    const { data, error: loadError } = await query;
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const paymentRows = (data ?? []) as PaymentRow[];
    setRows(paymentRows);

    const ids = Array.from(new Set(paymentRows.flatMap((r) => [r.payer_id, r.payee_id])));
    if (ids.length > 0) {
      const { data: profileRows } = await supabase.from('profiles').select('id,display_name,city').in('id', ids);
      const map: Record<string, ProfileLite> = {};
      for (const p of (profileRows ?? []) as ProfileLite[]) map[p.id] = p;
      setProfiles(map);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmWorker = async (id: string, next: boolean) => {
    const { error: rpcError } = await supabase.rpc('admin_confirm_payment', {
      p_payment_id: id,
      p_worker_confirmed: next,
    });
    if (!rpcError) load();
  };

  const total = useMemo(() => rows.length, [rows]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-ink-strong">Payment Verification</h1>
      </div>
      <p className="mb-6 text-sm text-ink-muted">ادائیگی کی تصدیق — confirm and reconcile job payments</p>

      <div className="mb-5 flex gap-2">
        {(['all', 'pending', 'paid'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              tab === t ? 'bg-primary text-white' : 'border border-border bg-surface text-ink-body hover:bg-surfaceAlt'
            }`}
          >
            {t === 'all' ? 'All Payments' : t}
          </button>
        ))}
      </div>

      <div className="rounded-xl2 border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-ink-strong">Transactions</div>
          <div className="text-xs text-ink-muted">{total} total</div>
        </div>

        {error ? <div className="p-5 text-sm text-danger">{error}</div> : null}
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No payments found.</div> : null}

        {rows.map((row) => {
          const customer = profiles[row.payer_id];
          const worker = profiles[row.payee_id];
          const isOpen = expanded === row.id;
          return (
            <div key={row.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => setExpanded(isOpen ? null : row.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surfaceAlt"
              >
                <div className="grid flex-1 grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-ink-muted">Customer</div>
                    <div className="text-sm font-medium text-ink-strong">
                      {customer?.display_name ?? '—'} {customer?.city ? `(${customer.city})` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-muted">Ustad</div>
                    <div className="text-sm font-medium text-ink-strong">{worker?.display_name ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-muted">Job Amount</div>
                    <div className="text-sm font-medium text-ink-strong">{formatPkr(row.amount_pkr)}</div>
                  </div>
                </div>
                <StatusPill status={row.status} />
              </button>

              {isOpen ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border bg-surfaceAlt px-5 py-4 text-sm md:grid-cols-3">
                  <Detail label="Payment Method" value={METHOD_LABEL[row.method]} />
                  <Detail label="Transaction ID" value={row.transaction_id ?? '—'} />
                  <Detail label="Ustad Confirmed" value={row.worker_confirmed ? 'Yes ✓' : 'No'} />
                  <Detail label="Admin Commission" value={formatPkr(row.fee_pkr)} />
                  <Detail label="Date & Time" value={new Date(row.created_at).toLocaleString('en-PK')} />
                  <Detail label="Note" value={row.note ?? '—'} />
                  <div className="col-span-full">
                    <button
                      onClick={() => confirmWorker(row.id, !row.worker_confirmed)}
                      className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft"
                    >
                      Mark as {row.worker_confirmed ? 'unconfirmed' : 'confirmed'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="font-medium text-ink-strong">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: PaymentRow['status'] }) {
  const styles: Record<PaymentRow['status'], string> = {
    paid: 'bg-primary-soft text-primary-deep',
    pending: 'bg-warning-soft text-amber-800',
    refunded: 'bg-info-soft text-sky-800',
    disputed: 'bg-danger-soft text-red-800',
  };
  return (
    <span className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}
