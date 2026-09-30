'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect, useRef } from 'react';

import type { MapWorker } from '@/lib/types';

export const CATEGORY_COLORS = ['#15803D', '#0EA5E9', '#F59E0B', '#DC2626', '#7C3AED', '#DB2777', '#0D9488', '#EA580C'];

export function colorForCategory(key: string | undefined, keys: string[]): string {
  const i = key ? keys.indexOf(key) : -1;
  return i >= 0 ? CATEGORY_COLORS[i % CATEGORY_COLORS.length] : '#6B7280';
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** OpenStreetMap (Leaflet) with one coloured dot per approved Ustad that has a saved location. */
export function WorkerMap({
  workers,
  categoryKeys,
  categoryLabel,
}: {
  workers: MapWorker[];
  categoryKeys: string[];
  categoryLabel: (key: string) => string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(el.current, { scrollWheelZoom: false }).setView([30.3753, 69.3451], 5);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const layer = layerRef.current!;
      layer.clearLayers();
      const points: [number, number][] = [];
      for (const w of workers) {
        const cat = w.categories?.[0];
        const color = colorForCategory(cat, categoryKeys);
        points.push([w.lat, w.lng]);
        L.circleMarker([w.lat, w.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 })
          .bindPopup(
            `<div style="min-width:160px"><strong>${esc(w.display_name) || '—'}</strong><br/>` +
              `${esc((w.categories ?? []).map(categoryLabel).join(', ')) || '—'}<br/>` +
              `${esc([w.area, w.city].filter(Boolean).join(', '))}<br/>` +
              `${w.avg_rating != null ? `★ ${w.avg_rating.toFixed(1)}<br/>` : ''}` +
              `${w.phone ? `☎ ${esc(w.phone)}<br/>` : ''}` +
              `<a href="/approvals/" style="color:#15803D;font-weight:600">Open in Approvals</a></div>`
          )
          .addTo(layer);
      }
      if (points.length > 0) mapRef.current!.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    })();
    return () => {
      cancelled = true;
    };
  }, [workers, categoryKeys, categoryLabel]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  return <div ref={el} className="h-[420px] w-full overflow-hidden rounded-lg border border-border" />;
}
