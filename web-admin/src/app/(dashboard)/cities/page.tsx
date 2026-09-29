'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

type City = { id: string; code: string; name: string; is_active: boolean; sort_order: number };
type Area = { id: string; city_id: string; name: string; is_active: boolean; sort_order: number };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CitiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCity, setNewCity] = useState('');
  const [newArea, setNewArea] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCities = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('cities')
      .select('id, code, name, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (e) setError(e.message);
    else {
      setCities((data ?? []) as City[]);
      setSelectedId((cur) => cur ?? (data?.[0]?.id ?? null));
    }
    setLoading(false);
  }, []);

  const loadAreas = useCallback(async (cityId: string) => {
    const { data, error: e } = await supabase
      .from('city_areas')
      .select('id, city_id, name, is_active, sort_order')
      .eq('city_id', cityId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (e) setError(e.message);
    else setAreas((data ?? []) as Area[]);
  }, []);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    if (selectedId) loadAreas(selectedId);
    else setAreas([]);
  }, [selectedId, loadAreas]);

  const run = async (op: PromiseLike<{ error: { message: string } | null }>, after: () => void) => {
    setError(null);
    const { error: e } = await op;
    if (e) setError(e.message);
    else after();
  };

  const addCity = () => {
    const name = newCity.trim();
    const code = slugify(name);
    if (!name || !code) return;
    const sort = (cities[cities.length - 1]?.sort_order ?? 0) + 1;
    run(supabase.from('cities').insert({ name, code, sort_order: sort }), () => {
      setNewCity('');
      loadCities();
    });
  };

  const renameCity = (c: City) => {
    const name = window.prompt('Rename city', c.name)?.trim();
    if (name && name !== c.name) run(supabase.from('cities').update({ name }).eq('id', c.id), loadCities);
  };

  const swapCities = (a: City, b: City | undefined) => {
    if (!b) return;
    run(
      Promise.all([
        supabase.from('cities').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('cities').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]).then(([r1, r2]) => ({ error: r1.error ?? r2.error })),
      loadCities
    );
  };

  const addArea = () => {
    const name = newArea.trim();
    if (!name || !selectedId) return;
    const sort = (areas[areas.length - 1]?.sort_order ?? 0) + 1;
    run(supabase.from('city_areas').insert({ city_id: selectedId, name, sort_order: sort }), () => {
      setNewArea('');
      loadAreas(selectedId);
    });
  };

  const renameArea = (a: Area) => {
    const name = window.prompt('Rename area', a.name)?.trim();
    if (name && name !== a.name)
      run(supabase.from('city_areas').update({ name }).eq('id', a.id), () => selectedId && loadAreas(selectedId));
  };

  const deleteArea = (a: Area) => {
    if (!window.confirm(`Delete area "${a.name}"?`)) return;
    run(supabase.from('city_areas').delete().eq('id', a.id), () => selectedId && loadAreas(selectedId));
  };

  const selected = cities.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink-strong">Cities &amp; Areas</h1>
      <p className="mb-6 text-sm text-ink-muted">
        شہر اور علاقے — these lists fill the City / Area pickers on the registration forms
      </p>

      {error ? <div className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</div> : null}
      {loading ? <div className="text-sm text-ink-muted">Loading…</div> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl2 border border-border bg-surface">
          <div className="border-b border-border px-5 py-4 text-sm font-semibold text-ink-strong">Cities</div>
          <div className="flex gap-2 border-b border-border p-4">
            <input
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCity()}
              placeholder="New city name"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink-strong"
            />
            <button onClick={addCity} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep">
              Add
            </button>
          </div>
          {cities.map((c, i) => (
            <div
              key={c.id}
              className={`flex items-center gap-2 border-b border-border px-4 py-2.5 last:border-b-0 ${
                c.id === selectedId ? 'bg-primary-soft' : ''
              }`}
            >
              <button onClick={() => setSelectedId(c.id)} className="flex-1 text-left text-sm font-medium text-ink-strong">
                {c.name} {!c.is_active ? <span className="ml-1 text-xs text-ink-muted">(hidden)</span> : null}
              </button>
              <IconBtn label="Up" onClick={() => swapCities(c, cities[i - 1])} disabled={i === 0} />
              <IconBtn label="Down" onClick={() => swapCities(c, cities[i + 1])} disabled={i === cities.length - 1} />
              <IconBtn label="Rename" onClick={() => renameCity(c)} />
              <IconBtn
                label={c.is_active ? 'Hide' : 'Show'}
                onClick={() => run(supabase.from('cities').update({ is_active: !c.is_active }).eq('id', c.id), loadCities)}
              />
            </div>
          ))}
        </section>

        <section className="rounded-xl2 border border-border bg-surface">
          <div className="border-b border-border px-5 py-4 text-sm font-semibold text-ink-strong">
            Areas{selected ? ` in ${selected.name}` : ''}
          </div>
          {selected ? (
            <>
              <div className="flex gap-2 border-b border-border p-4">
                <input
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addArea()}
                  placeholder="New area name"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink-strong"
                />
                <button onClick={addArea} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep">
                  Add
                </button>
              </div>
              {areas.length === 0 ? <div className="p-5 text-sm text-ink-muted">No areas yet.</div> : null}
              {areas.map((a) => (
                <div key={a.id} className="flex items-center gap-2 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div className="flex-1 text-sm text-ink-strong">
                    {a.name} {!a.is_active ? <span className="ml-1 text-xs text-ink-muted">(hidden)</span> : null}
                  </div>
                  <IconBtn label="Rename" onClick={() => renameArea(a)} />
                  <IconBtn
                    label={a.is_active ? 'Hide' : 'Show'}
                    onClick={() =>
                      run(supabase.from('city_areas').update({ is_active: !a.is_active }).eq('id', a.id), () =>
                        loadAreas(selected.id)
                      )
                    }
                  />
                  <IconBtn label="Delete" onClick={() => deleteArea(a)} danger />
                </div>
              ))}
            </>
          ) : (
            <div className="p-5 text-sm text-ink-muted">Select a city to manage its areas.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-30 ${
        danger ? 'border-danger text-danger hover:bg-danger-soft' : 'border-border text-ink-body hover:bg-surfaceAlt'
      }`}
    >
      {label}
    </button>
  );
}
