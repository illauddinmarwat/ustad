import { applyRanking, buildExplanations, RANKING_WEIGHTS, scoreListing } from './ranking';

describe('ranking helpers (Phase 3)', () => {
  it('returns 0 when all signals are absent', () => {
    expect(scoreListing({ rating: 0, ageDays: 0 })).toBeCloseTo(
      RANKING_WEIGHTS.RECENCY_WEIGHT,
      5
    );
  });

  it('weights are monotonic in rating', () => {
    const low = scoreListing({ rating: 1, responseRate: 0, completionRate: 0, ageDays: 999 });
    const high = scoreListing({ rating: 5, responseRate: 0, completionRate: 0, ageDays: 999 });
    expect(high).toBeGreaterThan(low);
  });

  it('caps rating at 5 and floors at 0', () => {
    const overshoot = scoreListing({ rating: 9, responseRate: 0, completionRate: 0, ageDays: 999 });
    const max = scoreListing({ rating: 5, responseRate: 0, completionRate: 0, ageDays: 999 });
    expect(overshoot).toBeCloseTo(max, 5);
    expect(scoreListing({ rating: -1, ageDays: 0 })).toBeCloseTo(
      RANKING_WEIGHTS.RECENCY_WEIGHT,
      5
    );
  });

  it('produces explainability labels only for meaningful signals', () => {
    expect(buildExplanations({ rating: 0 })).toEqual([]);
    expect(
      buildExplanations({ rating: 4.7, reviewCount: 12, responseRate: 0.9, completionRate: 0.95 })
    ).toEqual(['4.7★ (12)', 'Fast responder', 'Reliable completer']);
    expect(buildExplanations({ rating: 4.2 })).toEqual(['4.2★']);
    expect(buildExplanations({ rating: 0, isVerified: true })).toEqual(['Verified']);
  });

  it('applyRanking preserves caller order when disabled (legacy fallback)', () => {
    const input = [
      { id: 'a', created_at: '2026-05-01T00:00:00Z', signals: { rating: 0 } },
      { id: 'b', created_at: '2026-05-05T00:00:00Z', signals: { rating: 0 } },
    ];
    const out = applyRanking(input, false);
    expect(out.map((l) => l.id)).toEqual(['a', 'b']);
    expect(out.every((l) => l.score === 0)).toBe(true);
  });

  it('applyRanking sorts by score then created_at desc when enabled', () => {
    const newer = '2026-05-05T00:00:00Z';
    const older = '2026-04-01T00:00:00Z';
    const input = [
      { id: 'old-low', created_at: older, signals: { rating: 1 } },
      { id: 'new-tied', created_at: newer, signals: { rating: 4 } },
      { id: 'old-tied', created_at: older, signals: { rating: 4 } },
    ];
    const out = applyRanking(input, true);
    expect(out[0].id).toBe('new-tied');
    expect(out[1].id).toBe('old-tied');
    expect(out[2].id).toBe('old-low');
  });

  it('signals omitted treated as zero (deterministic safety)', () => {
    const out = applyRanking(
      [
        { id: 'no-signals', created_at: '2026-05-01T00:00:00Z' },
        { id: 'has-signals', created_at: '2026-05-01T00:00:00Z', signals: { rating: 5, completionRate: 1, responseRate: 1 } },
      ],
      true
    );
    expect(out[0].id).toBe('has-signals');
  });
});
