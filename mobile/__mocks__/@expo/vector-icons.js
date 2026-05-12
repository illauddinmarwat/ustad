// Lightweight test stub for `@expo/vector-icons`. Each icon family becomes a
// plain `<Text>` rendering the icon name so jest snapshots stay readable.
const React = require('react');
const { Text } = require('react-native');

function makeIconSet(family) {
  const IconSet = (props) => React.createElement(Text, props, `[${family}:${props.name ?? ''}]`);
  IconSet.displayName = family;
  return IconSet;
}

const Feather = makeIconSet('Feather');
const Ionicons = makeIconSet('Ionicons');
const MaterialCommunityIcons = makeIconSet('MaterialCommunityIcons');
const AntDesign = makeIconSet('AntDesign');
const FontAwesome = makeIconSet('FontAwesome');
const FontAwesome5 = makeIconSet('FontAwesome5');
const MaterialIcons = makeIconSet('MaterialIcons');
const Entypo = makeIconSet('Entypo');
const Octicons = makeIconSet('Octicons');
const SimpleLineIcons = makeIconSet('SimpleLineIcons');
const Foundation = makeIconSet('Foundation');
const Fontisto = makeIconSet('Fontisto');
const Zocial = makeIconSet('Zocial');
const EvilIcons = makeIconSet('EvilIcons');

module.exports = {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
  AntDesign,
  FontAwesome,
  FontAwesome5,
  MaterialIcons,
  Entypo,
  Octicons,
  SimpleLineIcons,
  Foundation,
  Fontisto,
  Zocial,
  EvilIcons,
};
