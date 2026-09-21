'use client';

import { useCallback, useEffect, useState } from 'react';

import { formatPkr } from '@/components/StatCard';
import { supabase } from '@/lib/supabaseClient';
import type { WorkerApprovalRow } from '@/lib/types';

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<WorkerApprovalRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc('admin_list_worker_approvals', {
      p_status: tab === 'all' ? null : tab,
    });
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as WorkerApprovalRow[]);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (userId: string, status: 'approved' | 'rejected', reason?: string) => {
    setBusyId(userId);
    const { error: rpcError } = await supabase.rpc('admin_set_worker_approval', {
      p_user_id: userId,
      p_status: status,
      p_reason: reason ?? null,
    });
    setBusyId(null);
    if (!rpcError) load();
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-ink-strong">Worker Approvals</h1>
      </div>
      <p className="mb-6 text-sm text-ink-muted">ہنر مند کارکنوں کی منظوری — review CNIC + registration data before a worker goes live</p>

      <div className="mb-5 flex gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              tab === t ? 'bg-primary text-white' : 'border border-border bg-surface text-ink-body hover:bg-surfaceAlt'
            }`}
          >
            {t === 'all' ? 'All Workers' : t}
          </button>
        ))}
      </div>

      <div className="rounded-xl2 border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-ink-strong">Registrations</div>
          <div className="text-xs text-ink-muted">{rows.length} total</div>
        </div>

        {error ? <div className="p-5 text-sm text-danger">{error}</div> : null}
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No workers found.</div> : null}

        {rows.map((row) => (
          <ApprovalRow
            key={row.user_id}
            row={row}
            isOpen={expanded === row.user_id}
            onToggle={() => setExpanded(expanded === row.user_id ? null : row.user_id)}
            onDecide={decide}
            busy={busyId === row.user_id}
          />
        ))}
      </div>
    </div>
  );
}

function ApprovalRow({
  row,
  isOpen,
  onToggle,
  onDecide,
  busy,
}: {
  row: WorkerApprovalRow;
  isOpen: boolean;
  onToggle: () => void;
  onDecide: (userId: string, status: 'approved' | 'rejected', reason?: string) => void;
  busy: boolean;
}) {
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen || frontUrl || backUrl) return;
    let cancelled = false;
    setDocsLoading(true);
    Promise.all([
      row.cnic_front_url
        ? supabase.storage.from('worker-documents').createSignedUrl(row.cnic_front_url, 300)
        : Promise.resolve({ data: null }),
      row.cnic_back_url
        ? supabase.storage.from('worker-documents').createSignedUrl(row.cnic_back_url, 300)
        : Promise.resolve({ data: null }),
    ]).then(([front, back]) => {
      if (cancelled) return;
      setFrontUrl(front.data?.signedUrl ?? null);
      setBackUrl(back.data?.signedUrl ?? null);
      setDocsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, frontUrl, backUrl, row.cnic_front_url, row.cnic_back_url]);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surfaceAlt"
      >
        <div className="grid flex-1 grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-ink-muted">Name</div>
            <div className="text-sm font-medium text-ink-strong">
              {row.display_name ?? '—'} {row.city ? `(${row.city})` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Category</div>
            <div className="text-sm font-medium text-ink-strong">{(row.categories ?? []).join(', ') || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Submitted</div>
            <div className="text-sm font-medium text-ink-strong">{new Date(row.created_at).toLocaleDateString('en-PK')}</div>
          </div>
        </div>
        <StatusPill status={row.approval_status} />
      </button>

      {isOpen ? (
        <div className="border-t border-border bg-surfaceAlt px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
            <Detail label="Phone" value={row.phone ?? '—'} />
            <Detail label="CNIC Number" value={row.cnic_number ?? '—'} />
            <Detail label="Experience" value={row.years_experience != null ? `${row.years_experience} yrs` : '—'} />
            <Detail
              label="Rate"
              value={row.rate_pkr != null ? `${formatPkr(row.rate_pkr)} / ${row.rate_unit ?? '—'}` : '—'}
            />
            <Detail label="Working Hours" value={row.working_hours ?? '—'} />
            {row.approval_status === 'rejected' ? (
              <Detail label="Rejection Reason" value={row.rejection_reason ?? '—'} />
            ) : null}
            <div className="col-span-full">
              <div className="text-xs text-ink-muted">Bio</div>
              <div className="text-sm text-ink-strong">{row.bio ?? '—'}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DocPreview label="Profile Photo" url={row.photo_url} loading={false} />
            <DocPreview label="CNIC Front" url={frontUrl} loading={docsLoading} />
            <DocPreview label="CNIC Back" url={backUrl} loading={docsLoading} />
          </div>

          {row.approval_status !== 'approved' && !rejecting ? (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onDecide(row.user_id, 'approved')}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-deep disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="rounded-lg border border-danger px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          ) : null}

          {rejecting ? (
            <div className="mt-4 flex flex-col gap-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection (shown to the worker)"
                className="w-full rounded-lg border border-border bg-surface p-2 text-sm text-ink-strong"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onDecide(row.user_id, 'rejected', reason)}
                  disabled={busy || !reason.trim()}
                  className="rounded-lg bg-danger px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => setRejecting(false)}
                  className="rounded-lg border border-border px-4 py-1.5 text-xs font-semibold text-ink-body hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {row.approval_status === 'approved' ? (
            <div className="mt-4">
              <button
                onClick={() => onDecide(row.user_id, 'rejected', 'Revoked by admin')}
                disabled={busy}
                className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                Revoke approval
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DocPreview({ label, url, loading }: { label: string; url: string | null; loading: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs text-ink-muted">{label}</div>
      <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
        {loading ? (
          <span className="text-xs text-ink-muted">Loading…</span>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-ink-muted">Not provided</span>
        )}
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

function StatusPill({ status }: { status: WorkerApprovalRow['approval_status'] }) {
  const styles: Record<WorkerApprovalRow['approval_status'], string> = {
    approved: 'bg-primary-soft text-primary-deep',
    pending: 'bg-warning-soft text-amber-800',
    rejected: 'bg-danger-soft text-red-800',
  };
  return (
    <span className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}
