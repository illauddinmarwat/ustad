import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VideoRecorder } from './VideoRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const camera = require('expo-camera');

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {node}
    </SafeAreaProvider>,
  );

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const callNames = () => camera.__state.calls.map((c: string[]) => c[0]);

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  Object.assign(camera.__state, {
    camGranted: true,
    micGranted: true,
    canToggle: true,
    recordUri: 'file:///clip.mp4',
    recordRejects: false,
    resolveRecording: null,
  });
  camera.__state.calls.length = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

async function openCamera(onChange = jest.fn()) {
  const u = wrap(<VideoRecorder value={null} onChange={onChange} />);
  fireEvent.press(u.getByLabelText('Record video'));
  await flush();
  return { u, onChange };
}

describe('VideoRecorder', () => {
  it('records, pauses, resumes and stops, counting only recorded time', async () => {
    const { u, onChange } = await openCamera();
    fireEvent.press(u.getByLabelText('Start recording'));
    await flush();
    expect(camera.__state.calls[0][0]).toBe('record');
    expect(camera.__state.calls[0][1]).toEqual({ maxFileSize: expect.any(Number) });

    await advance(5_000);
    fireEvent.press(u.getByLabelText('Pause'));
    await flush();
    await advance(10_000); // paused: does not count
    fireEvent.press(u.getByLabelText('Resume'));
    await flush();
    await advance(3_000);
    fireEvent.press(u.getByLabelText('Stop'));
    await flush();

    expect(callNames()).toEqual(['record', 'toggle', 'toggle', 'stop']);
    expect(onChange).toHaveBeenCalledWith({ uri: 'file:///clip.mp4', seconds: 8 });
  });

  it('stops by itself after 30 seconds of recording', async () => {
    const { u, onChange } = await openCamera();
    fireEvent.press(u.getByLabelText('Start recording'));
    await flush();
    await advance(30_500);
    await flush();
    expect(callNames()).toContain('stop');
    expect(onChange).toHaveBeenCalledWith({ uri: 'file:///clip.mp4', seconds: 30 });
  });

  it('hides Pause where the phone cannot pause a recording, and says so', async () => {
    camera.__state.canToggle = false;
    const { u } = await openCamera();
    expect(u.getByText(/Pause is not available on this phone/)).toBeTruthy();
    fireEvent.press(u.getByLabelText('Start recording'));
    await flush();
    expect(u.queryByLabelText('Pause')).toBeNull();
    expect(u.getByLabelText('Stop')).toBeTruthy();
  });

  it('explains a denied camera or microphone permission and starts nothing', async () => {
    camera.__state.micGranted = false;
    const { u } = await openCamera();
    expect(u.getByText(/Camera or microphone permission was denied/)).toBeTruthy();
    expect(u.queryByLabelText('Start recording')).toBeNull();
    expect(camera.__state.calls).toEqual([]);
  });

  it('closes without a clip when cancelled before recording', async () => {
    const { u, onChange } = await openCamera();
    fireEvent.press(u.getByLabelText('Cancel'));
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(u.getByLabelText('Record video')).toBeTruthy();
  });

  it('shows an error and lets the user try again when the camera fails', async () => {
    camera.__state.recordRejects = true;
    const { u, onChange } = await openCamera();
    fireEvent.press(u.getByLabelText('Start recording'));
    await flush();
    expect(u.getByText(/could not be made/)).toBeTruthy();
    expect(u.getByLabelText('Start recording')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the clip with a way to delete it and record again', async () => {
    const onChange = jest.fn();
    const u = wrap(<VideoRecorder value={{ uri: 'file:///clip.mp4', seconds: 12 }} onChange={onChange} />);
    expect(u.getByTestId('video-view')).toBeTruthy();
    fireEvent.press(u.getByText('Delete and record again'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
