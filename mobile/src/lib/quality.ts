export function clampSatisfaction(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

export function satisfactionLabel(value: number): string {
  const v = clampSatisfaction(value);
  if (v >= 5) return 'Excellent';
  if (v >= 4) return 'Good';
  if (v >= 3) return 'Okay';
  if (v >= 2) return 'Poor';
  return 'Very poor';
}
