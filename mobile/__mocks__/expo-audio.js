// Test double for expo-audio: no native module in Jest. Tests drive it through `__state`.
const state = {
  permissionGranted: true,
  recorderMillis: 0,
  recorderUri: 'file:///rec.m4a',
  playerStatus: { playing: false, currentTime: 0, duration: 0, didJustFinish: false },
  calls: [],
};

const recorder = {
  get uri() {
    return state.recorderUri;
  },
  prepareToRecordAsync: jest.fn(() => {
    state.calls.push('prepare');
    return Promise.resolve();
  }),
  record: jest.fn(() => state.calls.push('record')),
  pause: jest.fn(() => state.calls.push('pause')),
  stop: jest.fn(() => {
    state.calls.push('stop');
    return Promise.resolve();
  }),
  getStatus: jest.fn(() => ({ durationMillis: state.recorderMillis })),
};

const player = {
  play: jest.fn(() => state.calls.push('play')),
  pause: jest.fn(() => state.calls.push('playerPause')),
  seekTo: jest.fn(() => Promise.resolve()),
};

module.exports = {
  __state: state,
  __recorder: recorder,
  __player: player,
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 } },
  AudioModule: { requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: state.permissionGranted })) },
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioRecorder: () => recorder,
  useAudioRecorderState: () => ({ canRecord: true, isRecording: false, durationMillis: state.recorderMillis, url: null }),
  useAudioPlayer: () => player,
  createAudioPlayer: () => player,
  useAudioPlayerStatus: () => state.playerStatus,
};
