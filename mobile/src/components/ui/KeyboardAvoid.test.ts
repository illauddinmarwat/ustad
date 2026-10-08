import { keyboardOverlap } from './KeyboardAvoid';

describe('keyboardOverlap', () => {
  it('pads by the covered part when the window did not resize', () => {
    expect(keyboardOverlap(1600, 1030)).toBe(570);
  });
  it('pads nothing when Android already shrank the window above the keyboard', () => {
    expect(keyboardOverlap(1030, 1030)).toBe(0);
    expect(keyboardOverlap(683, 1030)).toBe(0);
  });
  it('pads nothing while the keyboard is hidden', () => {
    expect(keyboardOverlap(1600, null)).toBe(0);
  });
});
