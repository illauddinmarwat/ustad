import { getTabBarStyle } from './tabBarStyle';

describe('getTabBarStyle', () => {
  it('uses base height and padding when there is no bottom inset', () => {
    const style = getTabBarStyle({ bottom: 0 });
    expect(style.height).toBe(64);
    expect(style.paddingBottom).toBe(6);
    expect(style.paddingTop).toBe(6);
  });

  it('adds the bottom inset to height and paddingBottom (Android gesture nav)', () => {
    const style = getTabBarStyle({ bottom: 24 });
    expect(style.height).toBe(88);
    expect(style.paddingBottom).toBe(30);
  });

  it('clamps negative bottom insets to zero', () => {
    const style = getTabBarStyle({ bottom: -10 });
    expect(style.height).toBe(64);
    expect(style.paddingBottom).toBe(6);
  });
});
