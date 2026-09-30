import { Camera, CameraView } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../i18n/useT';
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  VIDEO_BITRATE,
  clockElapsed,
  clockPause,
  clockStart,
  videoSecondsFromMillis,
  type Clock,
  type VideoClip,
} from '../lib/videoNote';
import { formatClock } from '../lib/voiceNote';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Icon, type IconProps } from './ui/Icon';

type Phase = 'ready' | 'recording' | 'paused' | 'saving';

/** Play a recorded video (a local file or a signed URL). */
export function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={styles.player} nativeControls contentFit="contain" />;
}

function RoundButton({
  icon,
  label,
  onPress,
  tone = 'primary',
  size = 52,
}: {
  icon: IconProps['name'];
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'danger' | 'muted';
  size?: number;
}) {
  const bg = tone === 'danger' ? colors.danger : tone === 'muted' ? 'rgba(255,255,255,0.22)' : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
    >
      <Icon name={icon} size={size / 2.4} color="#fff" />
    </Pressable>
  );
}

type CaptureProps = { onDone: (clip: VideoClip) => void; onCancel: () => void };

/**
 * Full-screen camera: record, pause and resume, stop. The timer counts recorded time only, so pausing does not
 * use up the 30 seconds. Pause is native (`toggleRecordingAsync`), available on Android and iOS 18 or later;
 * where it is not available the button is hidden and the note is recorded in one go.
 */
function VideoCapture({ onDone, onCancel }: CaptureProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, setPermission] = useState<'asking' | 'granted' | 'denied'>('asking');
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [canPause, setCanPause] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [shownMs, setShownMs] = useState(0);
  const clock = useRef<Clock>({ accumulatedMs: 0, segmentStart: null });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cam = await Camera.requestCameraPermissionsAsync();
        const mic = await Camera.requestMicrophonePermissionsAsync();
        if (!cancelled) setPermission(cam.granted && mic.granted ? 'granted' : 'denied');
      } catch {
        if (!cancelled) setPermission('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(
    () => () => {
      stopTimer();
      if (!finished.current) void cameraRef.current?.stopRecording();
    },
    [],
  );

  const onReady = () => {
    setReady(true);
    try {
      setCanPause(!!cameraRef.current?.getSupportedFeatures().toggleRecordingAsyncAvailable);
    } catch {
      setCanPause(false);
    }
  };

  const stop = useCallback(() => {
    if (phase === 'saving') return;
    clock.current = clockPause(clock.current, Date.now());
    setShownMs(clock.current.accumulatedMs);
    setPhase('saving');
    stopTimer();
    void cameraRef.current?.stopRecording();
  }, [phase]);

  const start = async () => {
    const camera = cameraRef.current;
    if (!camera || !ready) return;
    setError(false);
    clock.current = clockStart({ accumulatedMs: 0, segmentStart: null }, Date.now());
    setShownMs(0);
    setPhase('recording');
    timer.current = setInterval(() => {
      const ms = clockElapsed(clock.current, Date.now());
      setShownMs(ms);
      if (ms >= MAX_VIDEO_SECONDS * 1000) stop();
    }, 250);
    try {
      const result = await camera.recordAsync({ maxFileSize: MAX_VIDEO_BYTES });
      stopTimer();
      const ms = clockElapsed(clock.current, Date.now());
      if (result?.uri) {
        finished.current = true;
        onDone({ uri: result.uri, seconds: videoSecondsFromMillis(ms) });
      } else {
        setPhase('ready');
        setError(true);
      }
    } catch {
      stopTimer();
      setPhase('ready');
      setError(true);
    }
  };

  const pause = async () => {
    try {
      await cameraRef.current?.toggleRecordingAsync();
      clock.current = clockPause(clock.current, Date.now());
      setShownMs(clock.current.accumulatedMs);
      setPhase('paused');
    } catch {
      setError(true);
    }
  };

  const resume = async () => {
    try {
      await cameraRef.current?.toggleRecordingAsync();
      clock.current = clockStart(clock.current, Date.now());
      setPhase('recording');
    } catch {
      setError(true);
    }
  };

  const seconds = Math.floor(shownMs / 1000);

  return (
    <View style={styles.capture}>
      {permission === 'granted' ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing="back"
          videoQuality="720p"
          videoBitrate={VIDEO_BITRATE}
          onCameraReady={onReady}
        />
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.clockPill}>
          <View style={[styles.dot, phase === 'recording' && styles.dotLive]} />
          <Text style={styles.clockText}>
            {formatClock(seconds)} / {formatClock(MAX_VIDEO_SECONDS)}
          </Text>
        </View>
        {phase === 'ready' ? (
          <RoundButton icon="x" label={t('media.cancel').en} onPress={onCancel} tone="muted" size={40} />
        ) : null}
      </View>

      {permission === 'denied' ? (
        <View style={styles.center}>
          <Banner id="media.cameraDenied" tone="warning" />
          <Pressable onPress={onCancel} accessibilityRole="button" style={styles.closeLink}>
            <Text style={[typography.label, styles.closeText]}>{t('media.cancel').en}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Banner id="media.recordFailed" tone="warning" />
        </View>
      ) : null}

      {permission === 'granted' ? (
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
          {phase === 'ready' ? (
            <RoundButton icon="video" label={t('media.startVideo').en} onPress={() => void start()} size={68} />
          ) : null}
          {phase === 'recording' || phase === 'paused' ? (
            <View style={styles.row}>
              {canPause ? (
                phase === 'recording' ? (
                  <RoundButton icon="pause" label={t('media.pause').en} onPress={() => void pause()} tone="muted" />
                ) : (
                  <RoundButton icon="video" label={t('media.resume').en} onPress={() => void resume()} />
                )
              ) : null}
              <RoundButton icon="square" label={t('media.stop').en} onPress={stop} tone="danger" size={68} />
            </View>
          ) : null}
          {phase === 'saving' ? <Text style={styles.savingText}>{t('media.saving').en}</Text> : null}
          {phase === 'ready' && !canPause && ready ? (
            <Text style={styles.noPause}>{t('media.noPause').en}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type Props = { value: VideoClip | null; onChange: (clip: VideoClip | null) => void };

/** Add a video of up to 30 seconds: opens the camera, then shows the clip with a delete and record-again option. */
export function VideoRecorder({ value, onChange }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <BiText id="media.video" variant="label" tone="body" style={styles.label} />
      {value ? (
        <View>
          <VideoPlayer uri={value.uri} />
          <Pressable onPress={() => onChange(null)} accessibilityRole="button" style={styles.again}>
            <Icon name="rotate-ccw" size={14} color={colors.danger} />
            <Text style={[typography.caption, styles.againText]}>{t('media.rerecordVideo').en}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('media.recordVideo').en}
          style={styles.start}
        >
          <Icon name="video" size={22} color={colors.primary} />
          <Text style={[typography.label, styles.startText]}>{t('media.recordVideo').en}</Text>
        </Pressable>
      )}
      <BiText id="media.videoHint" variant="caption" tone="muted" />

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <VideoCapture
          onDone={(clip) => {
            setOpen(false);
            onChange(clip);
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
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
  player: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: '#000', marginBottom: spacing.xs },
  again: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  againText: { color: colors.danger },
  capture: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  clockText: { ...typography.label, color: '#fff' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9ca3af' },
  dotLive: { backgroundColor: colors.danger },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  round: { alignItems: 'center', justifyContent: 'center' },
  savingText: { ...typography.label, color: '#fff' },
  noPause: { ...typography.caption, color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: spacing.lg },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  closeLink: { alignSelf: 'center', padding: spacing.md },
  closeText: { color: '#fff' },
  errorBox: { position: 'absolute', left: spacing.lg, right: spacing.lg, top: 110 },
});
