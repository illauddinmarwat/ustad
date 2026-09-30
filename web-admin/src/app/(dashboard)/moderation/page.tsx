'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import type { PostedJobRow } from '@/lib/types';

type MediaRow = { id: string; kind: string; path: string; url: string | null };

/** Photos on a posted job, with a Remove button for anything that breaks the rules. */
function JobMedia({ jobId, onError }: { jobId: string; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaRow[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_job_media', { p_job_id: jobId });
    if (error) {
      onError(error.message);
      return;
    }
    const rows = (data ?? []) as MediaRow[];
    const { data: signed } = rows.length
      ? await supabase.storage.from('job-media').createSignedUrls(rows.map((r) => r.path), 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] };
    const byPath = new Map((signed ?? []).map((x) => [x.path ?? '', x.signedUrl]));
    setItems(rows.map((r) => ({ ...r, url: byPath.get(r.path) ?? null })));
  }, [jobId, onError]);

  const remove = async (id: string) => {
    const { data, error } = await supabase.rpc('remove_job_media', { p_media_id: id });
    if (error) {
      onError(error.message);
      return;
    }
    if (typeof data === 'string' && data) await supabase.storage.from('job-media').remove([data]);
    load();
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && items === null) load();
        }}
        className="text-xs font-medium text-primary hover:underline"
      >
        {open ? 'Hide attachments' : 'Show attachments'}
      </button>
      {open ? (
        <div className="mt-2 flex flex-wrap gap-3">
          {items === null ? <span className="text-xs text-ink-muted">Loading…</span> : null}
          {items?.length === 0 ? <span className="text-xs text-ink-muted">No attachments.</span> : null}
          {items?.map((m) => (
            <div key={m.id} className="w-28">
              {m.kind === 'photo' && m.url ? (
                <a href={m.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="Job attachment" className="h-28 w-28 rounded-lg border border-border object-cover" />
                </a>
              ) : (
                <a href={m.url ?? '#'} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline">
                  {m.kind}
                </a>
              )}
              <button onClick={() => remove(m.id)} className="mt-1 text-xs text-danger hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ModerationPage() {
  const [rows, setRows] = useState<PostedJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('admin_list_posted_jobs', { p_limit: 100 });
    if (e) setError(e.message);
    else setRows((data ?? []) as PostedJobRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const close = async (id: string) => {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_close_posted_job', { p_job_id: id, p_reason: reason.trim() });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setClosing(null);
    setReason('');
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Posted jobs</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Open jobs from customers and guests. Close a job that is spam or breaks the rules. To stop an abusive customer, suspend them from the Admin tab in the mobile app; a
        suspended customer can no longer post jobs.
      </p>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="rounded-xl2 border border-border bg-surface">
        {loading ? <div className="p-5 text-sm text-ink-muted">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="p-5 text-sm text-ink-muted">No open posted jobs.</div> : null}
        {rows.map((r) => (
          <div key={r.id} className="border-b border-border px-5 py-4 last:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-ink-strong">{r.title}</div>
                <div className="text-xs text-ink-muted">
                  {r.category}
                  {r.city ? ` · ${r.city}` : ''} · {r.is_guest ? 'Guest' : r.customer_name ?? 'Customer'} · {r.quote_count} quotes ·
                  posted {new Date(r.created_at).toLocaleString()}
                </div>
                {r.description ? <div className="mt-1 text-sm text-ink-body">{r.description}</div> : null}
                {r.is_guest ? null : <JobMedia jobId={r.id} onError={setError} />}
              </div>
              {closing === r.id ? null : (
                <button
                  onClick={() => { setClosing(r.id); setReason(''); setError(null); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surfaceAlt"
                >
                  Close job
                </button>
              )}
            </div>
            {closing === r.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required)"
                  className="min-w-[16rem] flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
                />
                <button
                  disabled={busy}
                  onClick={() => close(r.id)}
                  className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Close it
                </button>
                <button onClick={() => setClosing(null)} className="px-3 py-1.5 text-sm text-ink-muted">Cancel</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
