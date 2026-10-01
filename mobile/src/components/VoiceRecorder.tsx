import {
  AudioModule,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../i18n/strings';
import { useT } from '../i18n/useT';
import {
  MAX_AUDIO_SECONDS,
  VOICE_RECORDING_OPTIONS,
  formatClock,
  secondsFromMillis,
  type VoiceNote,
} from '../lib/voiceNote';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Icon, type IconProps } from './ui/Icon';

type Phase = 'idle' | 'recording' | 'paused' | 'recorded';

type Props = {
  value: VoiceNote | null;
  onChange: (note: VoiceNote | null) => void;
  /** Longest note in seconds (default 60; quotes and thread messages use 30). */
  maxSeconds?: number;
  /** Hint text under the controls. */
  hintId?: StringId;
};

function RoundButton({
  icon,
  label,
  onPress,
  tone = 'primary',
}: {
  icon: IconProps['name'];
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'danger' | 'muted';
}) {
  const bg = tone === 'danger' ? colors.danger : tone === 'muted' ? colors.surface : colors.primary;
  const ink = tone === 'muted' ? colors.textStrong : '#fff';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.round, { backgroundColor: bg, borderColor: tone === 'muted' ? colors.border : bg }]}
    >
      <Icon name={icon} size={20} color={ink} />
    </Pressable>
  );
}

/** Play a recorded voice note (a local file or a signed URL). */
export function VoicePlayer({ uri, seconds }: { uri: string; seconds?: number | null }) {
  const { t } = useT();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : seconds ?? 0;

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (total > 0 && status.currentTime >= total - 0.2)) void player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={styles.playerRow}>
      <RoundButton
        icon={status.playing ? 'pause' : 'play'}
        label={status.playing ? t('media.pause').en : t('media.play').en}
        onPress={toggle}
      />
      <Text style={[typography.body, styles.clock]}>
        {formatClock(status.currentTime)} / {formatClock(total)}
      </Text>
    </View>
  );
}

/**
 * Record a voice note of up to 60 seconds: record, pause and resume, stop, listen, and record again.
 * Nothing is uploaded here; the parent receives the local file and uploads it with the job.
 */
export function VoiceRecorder({ value, onChange, maxSeconds = MAX_AUDIO_SECONDS, hintId = 'media.voiceHint' }: Props) {
  const { t } = useT();
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>(value ? 'recorded' : 'idle');
  const [error, setError] = useState<'denied' | 'failed' | null>(null);
  const stopping = useRef(false);

  useEffect(() => {
    if (!value && phase === 'recorded') setPhase('idle');
  }, [value, phase]);

  const finish = async () => {
    if (stopping.current) return;
    stopping.current = true;
    try {
      const ms = recorder.getStatus().durationMillis ?? state.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (uri) {
        onChange({ uri, seconds: Math.min(maxSeconds, secondsFromMillis(ms)) });
        setPhase('recorded');
      } else {
        setPhase('idle');
        setError('failed');
      }
    } catch {
      setPhase('idle');
      setError('failed');
    } finally {
      stopping.current = false;
    }
  };

  // Stop by itself at the limit.
  useEffect(() => {
    if (phase === 'recording' && state.durationMillis >= maxSeconds * 1000) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, state.durationMillis]);

  const start = async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      setError('failed');
    }
  };

  const pause = () => {
    recorder.pause();
    setPhase('paused');
  };

  const resume = () => {
    recorder.record();
    setPhase('recording');
  };

  const discard = () => {
    onChange(null);
    setPhase('idle');
    setError(null);
  };

  const seconds = Math.floor(state.durationMillis / 1000);

  return (
    <View style={styles.wrap}>
      <BiText id="media.voice" variant="label" tone="body" style={styles.label} />

      {phase === 'idle' ? (
        <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={t('media.record').en} style={styles.start}>
          <Icon name="mic" size={22} color={colors.primary} />
          <Text style={[typography.label, styles.startText]}>{t('media.record').en}</Text>
        </Pressable>
      ) : null}

      {phase === 'recording' || phase === 'paused' ? (
        <View style={styles.playerRow}>
          <View style={[styles.dot, phase === 'recording' && styles.dotLive]} />
          <Text style={[typography.body, styles.clock]}>
            {formatClock(seconds)} / {formatClock(maxSeconds)}
          </Text>
          {phase === 'recording' ? (
            <RoundButton icon="pause" label={t('media.pause').en} onPress={pause} tone="muted" />
          ) : (
            <RoundButton icon="mic" label={t('media.resume').en} onPress={resume} />
          )}
          <RoundButton icon="square" label={t('media.stop').en} onPress={() => void finish()} tone="danger" />
        </View>
      ) : null}

      {phase === 'recorded' && value ? (
        <View>
          <VoicePlayer uri={value.uri} seconds={value.seconds} />
          <Pressable onPress={discard} accessibilityRole="button" style={styles.again}>
            <Icon name="rotate-ccw" size={14} color={colors.danger} />
            <Text style={[typography.caption, styles.againText]}>{t('media.rerecord').en}</Text>
          </Pressable>
        </View>
      ) : null}

      <BiText id={hintId} variant="caption" tone="muted" />
      {error === 'denied' ? <Banner id="media.micDenied" tone="warning" /> : null}
      {error === 'failed' ? <Banner id="media.recordFailed" tone="warning" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { marginBottom: spacing.sm },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.xs,
  },
  startText: { color: colors.primary },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  clock: { color: colors.textStrong, minWidth: 80 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textMuted },
  dotLive: { backgroundColor: colors.danger },
  again: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  againText: { color: colors.danger },
});
