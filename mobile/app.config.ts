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
    backgroundColor: '#F4FBF6',
  },
  ios: { supportsTablet: true, bundleIdentifier: 'com.ustad.mobile' },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F4FBF6',
    },
    package: 'com.ustad.mobile',
    edgeToEdgeEnabled: true,
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    config: {
      // Required by react-native-maps on Android. Live tracking (Phase C)
      // degrades to no map tiles until this is set; unset is fine for
      // local/simulator work that doesn't touch the tracking screen.
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '' },
    },
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
      projectId: '0c7d0b0a-fa5b-4d3a-aa10-038b2fbf6ce1',
    },
  },
  plugins: [
    'expo-localization',
    'expo-font',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Ustad uses your location to show nearby professionals and their distance from you.',
      },
    ],
  ],
});
