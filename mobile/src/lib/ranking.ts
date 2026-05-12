/**
 * Ranking v2 (Phase 3) — pure helpers.
 *
 * Mirrors the weights used by `public.rank_listings` in
 * `supabase/migrations/20260507150000_phase3_ranking_ocr.sql`. Keeping the
 * client and server formulas in sync lets us:
 *   - re-rank already-fetched lists locally if the RPC is unavailable;
 *   - provide deterministic fallback when the `phase3_ranking_enabled` flag
 *     is off — ordering then reduces to `created_at desc`, matching the
 *     legacy listings query.
 *
 * Weights (sum = 100):
 *   rating          50  (avg_rating / 5)
 *   response_rate   20  (0..1)
 *   completion_rate 20  (0..1)
 *   recency         10  (1 / (1 + age_days/14))
 */

export type RankingSignals = {
  rating: number | null | undefined;
  reviewCount?: number | null;
  responseRate?: number | null;
  completionRate?: number | null;
  ageDays?: number | null;
  isVerified?: boolean | null;
};

export type RankableListing<T> = T & {
  id: string;
  created_at?: string | null;
  signals: RankingSignals;
};

export type ScoredListing<T> = RankableListing<T> & {
  score: number;
  explanations: string[];
};

const RATING_WEIGHT = 50;
const RESPONSE_WEIGHT = 20;
const COMPLETION_WEIGHT = 20;
const RECENCY_WEIGHT = 10;
const RECENCY_HALF_LIFE_DAYS = 14;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function scoreListing(signals: RankingSignals): number {
  const rating = Math.max(0, Math.min(5, Number(signals.rating ?? 0)));
  const responseRate = clamp01(Number(signals.responseRate ?? 0));
  const completionRate = clamp01(Number(signals.completionRate ?? 0));
  const ageDays = Math.max(0, Number(signals.ageDays ?? 0));

  const recency = 1 / (1 + ageDays / RECENCY_HALF_LIFE_DAYS);

  const score =
    (rating / 5) * RATING_WEIGHT
    + responseRate * RESPONSE_WEIGHT
    + completionRate * COMPLETION_WEIGHT
    + recency * RECENCY_WEIGHT;

  return Number(score.toFixed(2));
}

/**
 * Build short, user-facing explainability labels. Empty array means we have
 * no signals worth showing — the UI should suppress the row of chips.
 */
export function buildExplanations(signals: RankingSignals): string[] {
  const out: string[] = [];
  const rating = Number(signals.rating ?? 0);
  const reviewCount = Number(signals.reviewCount ?? 0);
  const responseRate = Number(signals.responseRate ?? 0);
  const completionRate = Number(signals.completionRate ?? 0);

  if (rating > 0 && reviewCount > 0) {
    out.push(`${rating.toFixed(1)}★ (${reviewCount})`);
  } else if (rating > 0) {
    out.push(`${rating.toFixed(1)}★`);
  }
  if (responseRate >= 0.8) out.push('Fast responder');
  if (completionRate >= 0.9) out.push('Reliable completer');
  if (signals.isVerified) out.push('Verified');
  return out;
}

const ageDaysFromIso = (iso?: string | null): number => {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 0;
  const ms = Date.now() - parsed;
  return Math.max(0, ms / 86_400_000);
};

/**
 * Apply ranking to an already-loaded list. When `enabled` is false we
 * preserve insertion order (caller already sorted by `created_at desc`).
 * Even when enabled, ties fall back to `created_at desc` so the result is
 * deterministic.
 */
export function applyRanking<T extends { id: string; created_at?: string | null }>(
  listings: Array<T & { signals?: RankingSignals }>,
  enabled: boolean
): Array<ScoredListing<T>> {
  const enriched = listings.map((listing) => {
    const signals: RankingSignals = listing.signals ?? { rating: 0 };
    const score = enabled ? scoreListing(signals) : 0;
    return {
      ...listing,
      signals,
      score,
      explanations: buildExplanations(signals),
    } as ScoredListing<T>;
  });

  if (!enabled) return enriched;

  return enriched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return ageDaysFromIso(a.created_at) - ageDaysFromIso(b.created_at);
  });
}

/**
 * Helper for tests and debugging — exposes the weight constants in one place.
 */
export const RANKING_WEIGHTS = {
  RATING_WEIGHT,
  RESPONSE_WEIGHT,
  COMPLETION_WEIGHT,
  RECENCY_WEIGHT,
  RECENCY_HALF_LIFE_DAYS,
} as const;
