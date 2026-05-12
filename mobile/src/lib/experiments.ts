/**
 * Deterministic cohort assignment for A/B experiments (Phase 3 slice 3e).
 *
 * The same `(userId, experimentKey)` pair always returns the same cohort —
 * lets us compare metrics like `ranking_clicked → ranking_applied →
 * ranking_quote_submitted` across cohorts without storing assignments
 * server-side. The helper is pure and side-effect-free; assignment events
 * are emitted via the existing analytics pipeline by the caller.
 *
 * Hash: FNV-1a 32-bit. Tiny, fast, deterministic; collision quality is
 * sufficient for cohort buckets (we only need uniform distribution, not
 * cryptographic strength).
 */

export type CohortDef = {
  /** Stable label written into analytics (e.g. 'control', 'ranking_v2'). */
  label: string;
  /** Weight 0..1; weights for an experiment must sum to 1. */
  weight: number;
};

export type Experiment = {
  key: string;
  cohorts: CohortDef[];
};

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiply with FNV prime, masked to 32 bits.
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Map `(userId, experimentKey)` to a deterministic float in [0, 1).
 * Anonymous users (null/empty) get a stable bucket per device session via
 * the experiment key alone — this keeps unauthenticated previews consistent
 * with no server roundtrip.
 */
export function cohortRoll(userId: string | null | undefined, experimentKey: string): number {
  const seed = `${userId ?? 'anon'}::${experimentKey}`;
  const hash = fnv1a32(seed);
  return hash / 0x100000000;
}

export function assignCohort(
  userId: string | null | undefined,
  experiment: Experiment
): CohortDef {
  if (experiment.cohorts.length === 0) {
    throw new Error(`Experiment ${experiment.key} has no cohorts`);
  }
  const totalWeight = experiment.cohorts.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) {
    return experiment.cohorts[0];
  }
  const roll = cohortRoll(userId, experiment.key) * totalWeight;
  let cumulative = 0;
  for (const cohort of experiment.cohorts) {
    cumulative += cohort.weight;
    if (roll < cumulative) return cohort;
  }
  return experiment.cohorts[experiment.cohorts.length - 1];
}

/**
 * Phase 3 ranking experiment definition. Adjust weights here without
 * re-deploying any DB migration; the DB-side flag (`phase3_ranking_enabled`)
 * still gates whether the v2 RPC is even called.
 */
export const RANKING_EXPERIMENT: Experiment = {
  key: 'phase3_ranking_v2',
  cohorts: [
    { label: 'control', weight: 0.5 },
    { label: 'ranking_v2', weight: 0.5 },
  ],
};
