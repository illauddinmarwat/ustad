export type CommunityTip = {
  id: string;
  title: string;
  body: string;
  lang: 'en' | 'ur' | 'bilingual';
  city_code: string;
  sort_order: number;
  created_at: string;
};

export function shouldShowCommunitySurface(enabled: boolean): boolean {
  return enabled;
}

export function normalizeCommunityTips(raw: unknown): CommunityTip[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => row as Partial<CommunityTip>)
    .filter((row) => !!row.id && !!row.title && !!row.body)
    .map((row) => ({
      id: String(row.id),
      title: String(row.title),
      body: String(row.body),
      lang: row.lang === 'ur' || row.lang === 'bilingual' ? row.lang : 'en',
      city_code: String(row.city_code ?? 'karachi').toLowerCase(),
      sort_order: Number(row.sort_order ?? 100),
      created_at: String(row.created_at ?? ''),
    }));
}
