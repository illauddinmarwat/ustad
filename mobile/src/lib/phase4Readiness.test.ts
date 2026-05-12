import { evaluatePhase4Readiness } from './phase4Readiness';

describe('phase4 readiness evaluator', () => {
  it('passes when all KPI thresholds are met', () => {
    const result = evaluatePhase4Readiness({
      promo_impressions: 1000,
      promo_clicks: 20,
      micro_surveys_submitted: 8,
      web_checkout_sessions_created: 3,
      claim_rows_open: 4,
    });
    expect(result.pass).toBe(true);
    expect(result.checks.every((c) => c.pass)).toBe(true);
  });

  it('fails when thresholds are missed', () => {
    const result = evaluatePhase4Readiness({
      promo_impressions: 0,
      promo_clicks: 0,
      micro_surveys_submitted: 1,
      web_checkout_sessions_created: 0,
      claim_rows_open: 50,
    });
    expect(result.pass).toBe(false);
    expect(result.checks.some((c) => !c.pass)).toBe(true);
  });
});
