// Test double for expo-camera: no native module in Jest. Tests drive it through `__state`.
const React = require('react');
const { View } = require('react-native');

const state = {
  camGranted: true,
  micGranted: true,
  canToggle: true,
  recordUri: 'file:///clip.mp4',
  recordRejects: false,
  calls: [],
  resolveRecording: null,
};

const CameraView = React.forwardRef(function CameraView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    getSupportedFeatures: () => ({ toggleRecordingAsyncAvailable: state.canToggle }),
    recordAsync: (options) => {
      state.calls.push(['record', options]);
      return new Promise((resolve, reject) => {
        if (state.recordRejects) reject(new Error('camera failed'));
        state.resolveRecording = () => resolve(state.recordUri ? { uri: state.recordUri } : undefined);
      });
    },
    stopRecording: () => {
      state.calls.push(['stop']);
      if (state.resolveRecording) state.resolveRecording();
      return Promise.resolve();
    },
    toggleRecordingAsync: () => {
      state.calls.push(['toggle']);
      return Promise.resolve();
    },
  }));
  React.useEffect(() => {
    if (props.onCameraReady) props.onCameraReady();
  }, []);
  return React.createElement(View, { testID: 'camera' });
});

module.exports = {
  __state: state,
  CameraView,
  Camera: {
    requestCameraPermissionsAsync: () => Promise.resolve({ granted: state.camGranted }),
    requestMicrophonePermissionsAsync: () => Promise.resolve({ granted: state.micGranted }),
  },
};
