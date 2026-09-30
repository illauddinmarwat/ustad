// Test double for expo-video: no native module in Jest.
const React = require('react');
const { View } = require('react-native');

module.exports = {
  useVideoPlayer: (source) => ({ source }),
  VideoView: (props) => React.createElement(View, { testID: 'video-view', accessibilityLabel: String(props.player && props.player.source) }),
};
