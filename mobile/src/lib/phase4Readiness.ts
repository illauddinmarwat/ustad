export type Phase4KpiSnapshot = {
  promo_impressions: number;
  promo_clicks: number;
  micro_surveys_submitted: number;
  web_checkout_sessions_created: number;
  claim_rows_open: number;
};

export type ReadinessResult = {
  pass: boolean;
  checks: Array<{ key: string; pass: boolean; note: string }>;
};

const safeRate = (num: number, den: number): number => {
  if (den <= 0) return 0;
  return num / den;
};

export function evaluatePhase4Readiness(kpi: Phase4KpiSnapshot): ReadinessResult {
  const ctr = safeRate(kpi.promo_clicks, kpi.promo_impressions);
  const checks = [
    {
      key: 'boost_ctr',
      pass: ctr >= 0.01,
      note: `promo CTR ${(ctr * 100).toFixed(2)}% (target >= 1.00%)`,
    },
    {
      key: 'survey_volume',
      pass: kpi.micro_surveys_submitted >= 5,
      note: `micro-surveys ${kpi.micro_surveys_submitted} (target >= 5)`,
    },
    {
      key: 'web_checkout_signal',
      pass: kpi.web_checkout_sessions_created >= 1,
      note: `web checkout sessions ${kpi.web_checkout_sessions_created} (target >= 1)`,
    },
    {
      key: 'open_claim_backlog',
      pass: kpi.claim_rows_open <= 20,
      note: `open claims ${kpi.claim_rows_open} (target <= 20)`,
    },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}
