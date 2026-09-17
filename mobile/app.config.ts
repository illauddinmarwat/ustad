import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ustad',
  slug: 'ustad',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#F7F8FB',
  },
  ios: { supportsTablet: true, bundleIdentifier: 'com.ustad.mobile' },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F7F8FB',
    },
    package: 'com.ustad.mobile',
    edgeToEdgeEnabled: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    /** mirrors EXPO_PUBLIC_USE_FIXTURES for bare workflow */
    useFixtures: process.env.EXPO_PUBLIC_USE_FIXTURES ?? '',
    /**
     * Phase 3 OCR scaffold — values are read from .env at build time and
     * surfaced via Constants.expoConfig.extra. Risky behavior remains gated
     * by `phase3_ocr_enabled` in app_settings; missing keys cause a graceful
     * manual fallback rather than a hard error.
     */
    googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY ?? '',
    groqApiKey: process.env.GROQ_API_KEY ?? '',
    groqVisionModel: process.env.GROQ_VISION_MODEL ?? '',
    visionProvider: process.env.VISION_PROVIDER ?? '',
    eas: {
      projectId: '1dd17107-c528-42e9-afed-c2b834674916',
    },
  },
  plugins: ['expo-localization', 'expo-font'],
});
