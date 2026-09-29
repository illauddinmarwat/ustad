'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

type Category = {
  key: string;
  name_en: string;
  name_ur: string;
  icon_path: string | null;
  template_category: string | null;
  is_active: boolean;
  sort_order: number;
};

const MAX_ICON_BYTES = 512 * 1024;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function iconUrl(path: string | null): string | null {
  return path ? supabase.storage.from('category-icons').getPublicUrl(path).data.publicUrl : null;
}

export default function CategoriesPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [templateCat, setTemplateCat] = useState('');
  const [newIcon, setNewIcon] = useState<File | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('skill_categories')
      .select('key, name_en, name_ur, icon_path, template_category, is_active, sort_order')
      .order('sort_order', { ascending: true });
    if (e) setError(e.message);
    else setRows((data ?? []) as Category[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checkIcon = (file: File): string | null => {
    if (!['image/png', 'image/jpeg'].includes(file.type)) return 'Icon must be a PNG or JPG image.';
    if (file.size > MAX_ICON_BYTES) return 'Icon must be 512 KB or smaller.';
    return null;
  };

  const uploadIcon = async (key: string, file: File): Promise<string | null> => {
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${key}-${Date.now()}.${ext}`;
    const { error: e } = await supabase.storage.from('category-icons').upload(path, file, { contentType: file.type });
    if (e) {
      setError(e.message);
      return null;
    }
    return path;
  };

  const add = async () => {
    const key = slugify(nameEn);
    if (!nameEn.trim() || !key) return;
    if (rows.some((r) => r.key === key)) {
      setError(`A category with key "${key}" already exists.`);
      return;
    }
    setBusy(true);
    setError(null);
    let iconPath: string | null = null;
    if (newIcon) {
      const problem = checkIcon(newIcon);
      if (problem) {
        setError(problem);
        setBusy(false);
        return;
      }
      iconPath = await uploadIcon(key, newIcon);
      if (!iconPath) {
        setBusy(false);
        return;
      }
    }
    const sort = (rows[rows.length - 1]?.sort_order ?? 0) + 1;
    const { error: e } = await supabase.from('skill_categories').insert({
      key,
      name_en: nameEn.trim(),
      name_ur: nameUr.trim(),
      icon_path: iconPath,
      template_category: templateCat.trim() || null,
      sort_order: sort,
    });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setNameEn('');
    setNameUr('');
    setTemplateCat('');
    setNewIcon(null);
    load();
  };

  const update = async (key: string, patch: Partial<Category>) => {
    setError(null);
    const { error: e } = await supabase.from('skill_categories').update(patch).eq('key', key);
    if (e) setError(e.message);
    else load();
  };

  const changeIcon = async (row: Category, file: File | undefined) => {
    if (!file) return;
    const problem = checkIcon(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const path = await uploadIcon(row.key, file);
    if (path) await update(row.key, { icon_path: path });
    setBusy(false);
  };

  const edit = (row: Category) => {
    const en = window.prompt('English name', row.name_en)?.trim();
    if (!en) return;
    const ur = window.prompt('Urdu name', row.name_ur)?.trim() ?? row.name_ur;
    update(row.key, { name_en: en, name_ur: ur });
  };

  const swap = async (a: Category, b: Category | undefined) => {
    if (!b) return;
    await Promise.all([
      supabase.from('skill_categories').update({ sort_order: b.sort_order }).eq('key', a.key),
      supabase.from('skill_categories').update({ sort_order: a.sort_order }).eq('key', b.key),
    ]);
    load();
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink-strong">Skill Categories</h1>
      <p className="mb-6 text-sm text-ink-muted">
        مہارت کی اقسام — name + icon shown in registration, Home, Nearby, Services and Post Job. A category in use can be
        hidden but not deleted.
      </p>

      {error ? <div className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</div> : null}

      <section className="mb-5 rounded-xl2 border border-border bg-surface p-4">
        <div className="mb-3 text-sm font-semibold text-ink-strong">Add category</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="English name (e.g. Mason)"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink-strong"
          />
          <input
            value={nameUr}
            onChange={(e) => setNameUr(e.target.value)}
            placeholder="اردو نام"
            dir="rtl"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink-strong"
          />
          <input
            value={templateCat}
            onChange={(e) => setTemplateCat(e.target.value)}
            placeholder="Service template category (optional)"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink-strong"
          />
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setNewIcon(e.target.files?.[0] ?? null)}
            className="text-sm text-ink-body"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={add}
            disabled={busy || !nameEn.trim()}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add category'}
          </button>
          <span className="text-xs text-ink-muted">Icon: PNG or JPG, square, up to 512 KB. Key is generated from the English name and cannot change later.</span>
        </div>
      </section>

      <section className="rounded-xl2 border border-border bg-surface">
        {rows.map((r, i) => {
          const url = iconUrl(r.icon_path);
          return (
            <div key={r.key} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-surfaceAlt">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={r.name_en} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-ink-muted">bundled</span>
                )}
              </div>
              <div className="min-w-[10rem] flex-1">
                <div className="text-sm font-medium text-ink-strong">
                  {r.name_en} <span className="text-ink-muted">· {r.name_ur}</span>
                  {!r.is_active ? <span className="ml-2 text-xs text-ink-muted">(hidden)</span> : null}
                </div>
                <div className="text-xs text-ink-muted">
                  key: {r.key} · templates: {r.template_category ?? '—'}
                </div>
              </div>
              <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs font-medium text-ink-body hover:bg-surfaceAlt">
                Change icon
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    changeIcon(r, e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              <Btn label="Up" onClick={() => swap(r, rows[i - 1])} disabled={i === 0} />
              <Btn label="Down" onClick={() => swap(r, rows[i + 1])} disabled={i === rows.length - 1} />
              <Btn label="Edit" onClick={() => edit(r)} />
              <Btn label={r.is_active ? 'Hide' : 'Show'} onClick={() => update(r.key, { is_active: !r.is_active })} />
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Btn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-ink-body hover:bg-surfaceAlt disabled:opacity-30"
    >
      {label}
    </button>
  );
}
