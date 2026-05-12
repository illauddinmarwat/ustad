import type { ViewStyle } from 'react-native';

/** Subtle elevation tokens. Use sparingly — only on raised surfaces. */
export const shadows: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: {
    shadowColor: '#0B0F19',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#0B0F19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0B0F19',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
};
