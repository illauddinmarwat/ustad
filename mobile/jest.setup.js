// Global jest setup. Stub out native-only Expo modules that aren't needed in
// unit tests; this keeps tests fast and avoids pulling in `expo-font` /
// `expo-asset` which require a real native runtime.

// Default in-memory AsyncStorage; a test that needs its own mock still overrides this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The native WebView (used by the map picker) is plain ESM that jest cannot load; a blank stand-in is enough.
jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const make = (family) => {
    const Icon = (props) => React.createElement(Text, props, `[${family}:${props.name ?? ''}]`);
    Icon.displayName = family;
    return Icon;
  };
  return {
    Feather: make('Feather'),
    Ionicons: make('Ionicons'),
    MaterialCommunityIcons: make('MaterialCommunityIcons'),
    AntDesign: make('AntDesign'),
    FontAwesome: make('FontAwesome'),
    FontAwesome5: make('FontAwesome5'),
    MaterialIcons: make('MaterialIcons'),
    Entypo: make('Entypo'),
    Octicons: make('Octicons'),
    SimpleLineIcons: make('SimpleLineIcons'),
    Foundation: make('Foundation'),
    Fontisto: make('Fontisto'),
    Zocial: make('Zocial'),
    EvilIcons: make('EvilIcons'),
  };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('expo-font', () => ({
  useFonts: () => [true],
  isLoaded: () => true,
  loadAsync: jest.fn(() => Promise.resolve()),
}));
