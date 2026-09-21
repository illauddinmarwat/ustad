import type { ViewStyle } from 'react-native';

import { colors } from '../theme/tokens';

type Insets = { bottom: number };

const BASE_HEIGHT = 84;
const BASE_PADDING_BOTTOM = 6;
const PADDING_TOP = 6;

/**
 * Returns a tab-bar style that respects the device bottom inset
 * (Android gesture indicator / iOS home indicator), so content and the
 * tab bar never overlap the system gesture / button area.
 */
export function getTabBarStyle(insets: Insets): ViewStyle {
  const bottom = Math.max(insets.bottom, 0);
  return {
    backgroundColor: colors.surface,
    borderTopColor: colors.divider,
    height: BASE_HEIGHT + bottom,
    paddingTop: PADDING_TOP,
    paddingBottom: BASE_PADDING_BOTTOM + bottom,
  };
}
