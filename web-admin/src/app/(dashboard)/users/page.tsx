'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

type UserRow = {
  id: string;
  role: 'customer' | 'worker';
  display_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  status: 'active' | 'suspended' | 'deleted';
  approval_status: string | null;
  created_at: string;
};

type DeletionRow = {
  id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
  reason: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
};

const BUCKETS = ['worker-documents', 'worker-photos'];

/** Removes every stored file in the person's folder; the database cannot delete the file blobs itself. */
async function removeStoredFiles(userId: string): Promise<void> {
  for (const bucket of BUCKETS) {
    const { data } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
    const paths = (data ?? []).filter((f) => f.name).map((f) => `${userId}/${f.name}`);
    if (paths.length) await supabase.storage.from(bucket).remove(paths);
  }
}

export default function UsersPage() {
  const [tab, setTab] = useState<'worker' | 'customer'>('worker');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [deletions, setDeletions] = useState<DeletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, del] = await Promise.all([
      supabase.rpc('admin_list_users', { p_role: tab, p_search: search.trim() || null, p_limit: 200 }),
      supabase.rpc('admin_list_user_deletions', { p_limit: 20 }),
    ]);
    if (list.error) setError(list.error.message);
    else setRows((list.data ?? []) as UserRow[]);
    if (!del.error) setDeletions((del.data ?? []) as DeletionRow[]);
    setLoading(false);
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setStatus = async (row: UserRow, status: 'active' | 'suspended') => {
    setError(null);
    setBusyId(row.id);
    const { error: e } = await supabase.rpc('admin_set_user_status', { p_user_id: row.id, p_status: status });
    setBusyId(null);
    if (e) setError(e.message);
    else await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Users</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Deactivate blocks a person until you activate them again. Delete is permanent: personal details and documents are erased, but
        their jobs, payments and reviews are kept under &ldquo;Deleted user&rdquo;.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {(['worker', 'customer'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setTab(r)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
              tab === r ? 'bg-primary text-white' : 'border border-border text-ink-body hover:bg-surface'
            }`}
          >
            {r === 'worker' ? 'Ustads' : 'Customers'}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone or email"
          className="min-w-[220px] flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}

      <div className="overflow-x-auto rounded-xl2 border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-ink-strong">{r.display_name ?? '—'}</td>
                <td className="px-3 py-2 text-ink-body">
                  <div>{r.phone ?? '—'}</div>
                  <div className="text-xs text-ink-muted">{r.status === 'deleted' ? '—' : r.email}</div>
                </td>
                <td className="px-3 py-2 text-ink-body">{[r.area, r.city].filter(Boolean).join(', ') || '—'}</td>
                <td className="px-3 py-2">
                  <StatusPill status={r.status} />
                  {r.role === 'worker' && r.approval_status && r.approval_status !== 'approved' && r.status !== 'deleted' ? (
                    <span className="ml-2 text-xs text-ink-muted">{r.approval_status}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status === 'deleted' ? (
                    <span className="text-xs text-ink-muted">Deleted</span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      {r.status === 'active' ? (
                        <button
                          onClick={() => setStatus(r, 'suspended')}
                          disabled={busyId === r.id}
                          className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-ink-body hover:bg-bg disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(r, 'active')}
                          disabled={busyId === r.id}
                          className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-deep disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => setTarget(r)}
                        className="rounded-lg border border-danger px-3 py-1 text-xs font-semibold text-danger hover:bg-danger-soft"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-ink-muted">
                  Nobody found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="mt-6 rounded-xl2 border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-strong">Recent deletions</h2>
        {deletions.length === 0 ? <p className="text-xs text-ink-muted">No deletions yet.</p> : null}
        {deletions.map((d) => (
          <div key={d.id} className="flex flex-wrap justify-between gap-2 border-t border-border py-2 text-xs first:border-t-0">
            <span className="font-medium text-ink-body">
              {d.display_name ?? '—'} ({d.role}) · {d.email ?? '—'}
            </span>
            <span className="text-ink-muted">
              {d.reason} · {d.deleted_by_name ?? 'admin'} · {new Date(d.deleted_at).toLocaleString()}
            </span>
          </div>
        ))}
      </section>

      {target ? (
        <DeleteDialog
          user={target}
          onClose={() => setTarget(null)}
          onDeleted={async () => {
            setTarget(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: UserRow['status'] }) {
  const style =
    status === 'active'
      ? 'bg-primary-soft text-primary-deep'
      : status === 'suspended'
        ? 'bg-warning-soft text-warning'
        : 'bg-border text-ink-muted';
  const label = status === 'active' ? 'Active' : status === 'suspended' ? 'Deactivated' : 'Deleted';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

function DeleteDialog({ user, onClose, onDeleted }: { user: UserRow; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = (user.display_name ?? '').trim();
  const canDelete = !busy && reason.trim().length > 0 && expected.length > 0 && typed.trim() === expected;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    // The database call goes first: it refuses (e.g. a job in progress) before any file is touched.
    const { error: e } = await supabase.rpc('admin_delete_user', { p_user_id: user.id, p_reason: reason.trim() });
    if (e) {
      setError(e.message);
      setBusy(false);
      return;
    }
    if (user.role === 'worker') {
      try {
        await removeStoredFiles(user.id);
      } catch {
        // the account is already erased; leftover files can be cleared from Storage by hand
      }
    }
    setBusy(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Delete user">
      <div className="w-full max-w-md rounded-xl2 bg-surface p-5">
        <h3 className="text-base font-bold text-danger">Permanently delete {user.display_name ?? 'this user'}?</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-body">
          <li>Name, phone, email, address, location and login are erased. This cannot be undone.</li>
          {user.role === 'worker' ? <li>CNIC number and images and the profile photo are erased.</li> : null}
          <li>Jobs, payments, commissions and reviews are kept, shown as &ldquo;Deleted user&rdquo;.</li>
          {user.role === 'customer' ? <li>Their open requests are cancelled.</li> : null}
          <li>Not possible while they have a job in progress.</li>
        </ul>
        <label className="mt-3 block text-xs font-medium text-ink-muted">Reason (saved in the deletion log)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-border p-2 text-sm text-ink-strong"
        />
        <label className="mt-3 block text-xs font-medium text-ink-muted">
          Type <span className="font-bold text-ink-strong">{expected || '(no name)'}</span> to confirm
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-danger"
        />
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-border px-4 py-1.5 text-xs font-semibold text-ink-body">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!canDelete}
            className="rounded-lg bg-danger px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
