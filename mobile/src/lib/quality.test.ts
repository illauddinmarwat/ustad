import { clampSatisfaction, satisfactionLabel } from './quality';

describe('phase4 quality helpers', () => {
  it('clamps satisfaction to 1..5', () => {
    expect(clampSatisfaction(0)).toBe(1);
    expect(clampSatisfaction(3.2)).toBe(3);
    expect(clampSatisfaction(9)).toBe(5);
  });

  it('maps satisfaction to labels', () => {
    expect(satisfactionLabel(5)).toBe('Excellent');
    expect(satisfactionLabel(4)).toBe('Good');
    expect(satisfactionLabel(2)).toBe('Poor');
  });
});
