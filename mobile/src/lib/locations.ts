import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type City = { id: string; name: string };
export type Area = { id: string; name: string };

type LoadState<T> = { items: T[]; loading: boolean; failed: boolean; reload: () => void };

let cityCache: City[] | null = null;
const areaCache = new Map<string, Area[]>();

async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as City[];
}

async function fetchAreas(cityId: string): Promise<Area[]> {
  const { data, error } = await supabase
    .from('city_areas')
    .select('id, name')
    .eq('city_id', cityId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Area[];
}

export function useCities(): LoadState<City> {
  const [items, setItems] = useState<City[]>(cityCache ?? []);
  const [loading, setLoading] = useState(!cityCache);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetchCities()
      .then((list) => {
        cityCache = list;
        setItems(list);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, failed, reload: load };
}

export function useAreas(cityId: string | null): LoadState<Area> {
  const [items, setItems] = useState<Area[]>(cityId ? (areaCache.get(cityId) ?? []) : []);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!cityId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setFailed(false);
    fetchAreas(cityId)
      .then((list) => {
        areaCache.set(cityId, list);
        setItems(list);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [cityId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, failed, reload: load };
}
