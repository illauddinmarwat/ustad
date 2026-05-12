// Global jest setup. Stub out native-only Expo modules that aren't needed in
// unit tests; this keeps tests fast and avoids pulling in `expo-font` /
// `expo-asset` which require a real native runtime.

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
