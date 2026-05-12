module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  testMatch: ['**/?(*.)+(test).[tj]s?(x)'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo(nent)?|expo-.*|@expo|@expo-google-fonts|@unimodules|unimodules|@sentry|native-base|react-clone-referenced-element)/)',
  ],
};
