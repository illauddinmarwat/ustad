import type { Config } from 'tailwindcss';

// Mirrors mobile/src/theme/tokens.ts so the admin web app matches the
// Ustad brand green used across the mobile app and the reference blueprints.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F4FBF6',
        surface: '#FFFFFF',
        surfaceAlt: '#EAF6EE',
        border: '#DCEFE1',
        primary: {
          DEFAULT: '#15803D',
          deep: '#14532D',
          soft: '#DCFCE7',
        },
        warning: { DEFAULT: '#F59E0B', soft: '#FEF3C7' },
        danger: { DEFAULT: '#DC2626', soft: '#FEE2E2' },
        info: { DEFAULT: '#0EA5E9', soft: '#E0F2FE' },
        ink: {
          strong: '#0B0F19',
          body: '#384151',
          muted: '#6B7280',
        },
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
