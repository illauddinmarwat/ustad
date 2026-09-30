import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { VoicePlayer, VoiceRecorder } from './VoiceRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('expo-audio');

beforeEach(() => {
  audio.__state.permissionGranted = true;
  audio.__state.recorderMillis = 0;
  audio.__state.recorderUri = 'file:///rec.m4a';
  audio.__state.playerStatus = { playing: false, currentTime: 0, duration: 0, didJustFinish: false };
  audio.__state.calls.length = 0;
});

describe('VoiceRecorder', () => {
  it('records, pauses, resumes, stops and hands back the file with its length', async () => {
    const onChange = jest.fn();
    const u = render(<VoiceRecorder value={null} onChange={onChange} />);
    fireEvent.press(u.getByLabelText('Record voice note'));
    await waitFor(() => expect(audio.__state.calls).toEqual(['prepare', 'record']));

    fireEvent.press(await u.findByLabelText('Pause'));
    expect(audio.__state.calls).toContain('pause');
    fireEvent.press(await u.findByLabelText('Resume'));
    expect(audio.__state.calls.filter((c: string) => c === 'record')).toHaveLength(2);

    audio.__state.recorderMillis = 12_400;
    fireEvent.press(await u.findByLabelText('Stop'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ uri: 'file:///rec.m4a', seconds: 12 }));
    expect(audio.__state.calls).toContain('stop');
  });

  it('tells the user when the microphone is denied, and does not record', async () => {
    audio.__state.permissionGranted = false;
    const u = render(<VoiceRecorder value={null} onChange={jest.fn()} />);
    fireEvent.press(u.getByLabelText('Record voice note'));
    expect(await u.findByText(/Microphone permission was denied/)).toBeTruthy();
    expect(audio.__state.calls).toEqual([]);
  });

  it('lets the user delete a recording and start again', async () => {
    const onChange = jest.fn();
    const u = render(<VoiceRecorder value={{ uri: 'file:///rec.m4a', seconds: 9 }} onChange={onChange} />);
    expect(u.getByText('0:00 / 0:09')).toBeTruthy();
    await act(async () => {
      fireEvent.press(u.getByText('Delete and record again'));
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('stops by itself at 60 seconds', async () => {
    const onChange = jest.fn();
    const u = render(<VoiceRecorder value={null} onChange={onChange} />);
    fireEvent.press(u.getByLabelText('Record voice note'));
    await waitFor(() => expect(audio.__state.calls).toContain('record'));
    audio.__state.recorderMillis = 60_000;
    u.rerender(<VoiceRecorder value={null} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ uri: 'file:///rec.m4a', seconds: 60 }));
  });

  it('reports a failed recording when no file comes back', async () => {
    audio.__state.recorderUri = null;
    const u = render(<VoiceRecorder value={null} onChange={jest.fn()} />);
    fireEvent.press(u.getByLabelText('Record voice note'));
    fireEvent.press(await u.findByLabelText('Stop'));
    expect(await u.findByText(/could not be made/)).toBeTruthy();
  });
});

describe('VoicePlayer', () => {
  it('plays and pauses', () => {
    const u = render(<VoicePlayer uri="https://x/y.m4a" seconds={20} />);
    expect(u.getByText('0:00 / 0:20')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Play'));
    expect(audio.__state.calls).toContain('play');
  });

  it('shows the pause button while playing', () => {
    audio.__state.playerStatus = { playing: true, currentTime: 5, duration: 20, didJustFinish: false };
    const u = render(<VoicePlayer uri="https://x/y.m4a" />);
    expect(u.getByText('0:05 / 0:20')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Pause'));
    expect(audio.__state.calls).toContain('playerPause');
  });
});
