import type { ImageSourcePropType } from 'react-native';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export type SkillCategory = {
  key: string;
  en: string;
  ur: string;
  icon: ImageSourcePropType;
  templateCategory: string | null;
};

const BUNDLED_ICONS: Record<string, ImageSourcePropType> = {
  electrician: require('../../assets/skills/skill-icon-electrician.png'),
  plumber: require('../../assets/skills/skill-icon-plumber.png'),
  carpenter: require('../../assets/skills/skill-icon-carpenter.png'),
  painter: require('../../assets/skills/skill-icon-painter.png'),
  ac_technician: require('../../assets/skills/skill-icon-ac_technician.png'),
  welder: require('../../assets/skills/skill-icon-welder.png'),
};

const GENERIC_ICON: ImageSourcePropType = require('../../assets/logo-mark.png');

// Offline / first-launch fallback; the admin-managed table replaces this once loaded.
export const DEFAULT_SKILL_CATEGORIES: SkillCategory[] = [
  { key: 'electrician', en: 'Electrician', ur: 'الیکٹریشن', icon: BUNDLED_ICONS.electrician, templateCategory: 'electrical' },
  { key: 'plumber', en: 'Plumber', ur: 'پلمبر', icon: BUNDLED_ICONS.plumber, templateCategory: 'plumbing' },
  { key: 'carpenter', en: 'Carpenter', ur: 'بڑھئی', icon: BUNDLED_ICONS.carpenter, templateCategory: 'carpentry' },
  { key: 'painter', en: 'Painter', ur: 'پینٹر', icon: BUNDLED_ICONS.painter, templateCategory: 'painting' },
  { key: 'ac_technician', en: 'AC Technician', ur: 'اے سی ٹیکنیشن', icon: BUNDLED_ICONS.ac_technician, templateCategory: 'hvac' },
  { key: 'welder', en: 'Welder', ur: 'ویلڈر', icon: BUNDLED_ICONS.welder, templateCategory: 'welding' },
];

type Row = {
  key: string;
  name_en: string;
  name_ur: string | null;
  icon_path: string | null;
  template_category: string | null;
};

let current: SkillCategory[] = DEFAULT_SKILL_CATEGORIES;
let inflight: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();
const REFRESH_MS = 5 * 60 * 1000;

/** Snapshot of the categories currently known (admin list once loaded, bundled defaults before). */
export function getSkillCategories(): SkillCategory[] {
  return current;
}

export function iconUrlFor(path: string): string {
  return supabase.storage.from('category-icons').getPublicUrl(path).data.publicUrl;
}

function toCategory(row: Row): SkillCategory {
  const icon: ImageSourcePropType = row.icon_path
    ? { uri: iconUrlFor(row.icon_path) }
    : (BUNDLED_ICONS[row.key] ?? GENERIC_ICON);
  return {
    key: row.key,
    en: row.name_en,
    ur: row.name_ur ?? '',
    icon,
    templateCategory: row.template_category,
  };
}

export function refreshSkillCategories(force = false): Promise<void> {
  if (!force && loadedAt && Date.now() - loadedAt < REFRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('skill_categories')
        .select('key, name_en, name_ur, icon_path, template_category')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error || !data || data.length === 0) return;
      current = (data as Row[]).map(toCategory);
      loadedAt = Date.now();
      listeners.forEach((fn) => fn());
    } catch {
      // keep the previous list
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useSkillCategories(): SkillCategory[] {
  const [list, setList] = useState(current);
  useEffect(() => {
    const sync = () => setList(current);
    listeners.add(sync);
    sync();
    void refreshSkillCategories();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return list;
}

/** Display name for a skill key, tolerating keys that were since deactivated. */
export function skillNameFor(key: string | null | undefined): SkillCategory | null {
  if (!key) return null;
  const hit = current.find((c) => c.key === key);
  if (hit) return hit;
  const pretty = key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return { key, en: pretty, ur: '', icon: BUNDLED_ICONS[key] ?? GENERIC_ICON, templateCategory: null };
}
