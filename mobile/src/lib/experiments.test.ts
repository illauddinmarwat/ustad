import {
  assignCohort,
  cohortRoll,
  fnv1a32,
  RANKING_EXPERIMENT,
  type Experiment,
} from './experiments';

describe('experiments — fnv1a32 hash', () => {
  it('is deterministic', () => {
    expect(fnv1a32('hello')).toBe(fnv1a32('hello'));
  });

  it('differs for distinct inputs', () => {
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = fnv1a32('user-42::phase3_ranking_v2');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('experiments — cohortRoll', () => {
  it('produces values in [0, 1)', () => {
    for (const id of ['u1', 'u2', 'u3', null, '']) {
      const r = cohortRoll(id, 'k');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('is stable across calls', () => {
    expect(cohortRoll('user-1', 'phase3_ranking_v2')).toBe(
      cohortRoll('user-1', 'phase3_ranking_v2')
    );
  });

  it('changes with the experiment key', () => {
    const a = cohortRoll('user-1', 'experiment_a');
    const b = cohortRoll('user-1', 'experiment_b');
    expect(a).not.toBe(b);
  });
});

describe('assignCohort', () => {
  const exp: Experiment = {
    key: 'demo',
    cohorts: [
      { label: 'control', weight: 0.5 },
      { label: 'treatment', weight: 0.5 },
    ],
  };

  it('returns the same cohort for the same user', () => {
    const a = assignCohort('user-42', exp);
    const b = assignCohort('user-42', exp);
    expect(a.label).toBe(b.label);
  });

  it('respects the weight distribution within a small tolerance', () => {
    const counts: Record<string, number> = { control: 0, treatment: 0 };
    for (let i = 0; i < 10_000; i += 1) {
      const c = assignCohort(`u-${i}`, exp);
      counts[c.label] += 1;
    }
    // 50/50 split — allow 5% drift either way.
    expect(counts.control / 10_000).toBeGreaterThan(0.45);
    expect(counts.control / 10_000).toBeLessThan(0.55);
  });

  it('handles single-cohort experiments', () => {
    const single: Experiment = { key: 'single', cohorts: [{ label: 'all', weight: 1 }] };
    expect(assignCohort('any', single).label).toBe('all');
  });

  it('throws when no cohorts defined', () => {
    expect(() => assignCohort('any', { key: 'empty', cohorts: [] })).toThrow();
  });

  it('exposes a Phase 3 ranking experiment with weights summing to 1', () => {
    const total = RANKING_EXPERIMENT.cohorts.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(RANKING_EXPERIMENT.cohorts.map((c) => c.label).sort()).toEqual(['control', 'ranking_v2']);
  });
});
