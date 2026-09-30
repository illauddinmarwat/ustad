import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import { Button } from './Button';
import { Icon } from './Icon';

type Props = {
  visible: boolean;
  uri: string | null;
  /** Width ÷ height to lock the crop box to (1 = square). Omit for a free-form box. */
  aspect?: number | null;
  onDone: (uri: string) => void;
  onCancel: () => void;
};

type Rect = { x: number; y: number; w: number; h: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const MIN = 64;
const HANDLE = 28;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Rotate + crop step shown after a photo is picked. Rotation is baked in immediately so the crop box always matches what you see. */
export function ImageEditorModal({ visible, uri, aspect = null, onDone, onCancel }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [busy, setBusy] = useState(false);

  // Fit of the image inside the stage.
  const fit = useMemo(() => {
    if (!image || !stage.w || !stage.h) return null;
    const scale = Math.min(stage.w / image.width, stage.h / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    return { scale, w, h, x: (stage.w - w) / 2, y: (stage.h - h) / 2 };
  }, [image, stage]);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  useEffect(() => {
    if (!visible || !uri) {
      setImage(null);
      return;
    }
    let live = true;
    Image.getSize(
      uri,
      (width, height) => live && setImage({ uri, width, height }),
      () => live && onCancel()
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, uri]);

  const resetRect = useCallback(() => {
    const f = fitRef.current;
    if (!f) return;
    const a = aspectRef.current;
    let w = f.w * 0.9;
    let h = f.h * 0.9;
    if (a) {
      w = Math.min(w, h * a);
      h = w / a;
    }
    setRect({ x: f.x + (f.w - w) / 2, y: f.y + (f.h - h) / 2, w, h });
  }, []);

  useEffect(() => {
    resetRect();
  }, [image, stage, resetRect]);

  const move = useMemo(() => {
    let start: Rect = { x: 0, y: 0, w: 0, h: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = rectRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const f = fitRef.current;
        if (!f) return;
        setRect({
          ...start,
          x: clamp(start.x + g.dx, f.x, f.x + f.w - start.w),
          y: clamp(start.y + g.dy, f.y, f.y + f.h - start.h),
        });
      },
    });
  }, []);

  const resizer = useCallback(
    (corner: Corner) => {
      let start: Rect = { x: 0, y: 0, w: 0, h: 0 };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start = rectRef.current;
        },
        onPanResponderMove: (_e, g) => {
          const f = fitRef.current;
          if (!f) return;
          const a = aspectRef.current;
          const left = corner === 'tl' || corner === 'bl';
          const top = corner === 'tl' || corner === 'tr';
          // Fixed anchor is the corner opposite the one being dragged.
          const ax = left ? start.x + start.w : start.x;
          const ay = top ? start.y + start.h : start.y;
          const maxW = left ? ax - f.x : f.x + f.w - ax;
          const maxH = top ? ay - f.y : f.y + f.h - ay;
          let w = clamp(start.w + (left ? -g.dx : g.dx), MIN, maxW);
          let h = clamp(start.h + (top ? -g.dy : g.dy), MIN, maxH);
          if (a) {
            w = Math.min(w, maxH * a);
            w = Math.max(w, MIN);
            h = w / a;
          }
          setRect({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
        },
      });
    },
    []
  );

  const handles = useMemo(
    () => ({ tl: resizer('tl'), tr: resizer('tr'), bl: resizer('bl'), br: resizer('br') }),
    [resizer]
  );

  const rotate = async (deg: number) => {
    if (!image || busy) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(image.uri).rotate(deg);
      const ref = await ctx.renderAsync();
      const saved = await ref.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
      setImage({ uri: saved.uri, width: saved.width, height: saved.height });
    } catch {
      // keep the current image if rotation fails
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!image || !fit || busy) return;
    setBusy(true);
    try {
      const originX = clamp(Math.round((rect.x - fit.x) / fit.scale), 0, image.width - 1);
      const originY = clamp(Math.round((rect.y - fit.y) / fit.scale), 0, image.height - 1);
      const width = clamp(Math.round(rect.w / fit.scale), 1, image.width - originX);
      const height = clamp(Math.round(rect.h / fit.scale), 1, image.height - originY);
      const ref = await ImageManipulator.manipulate(image.uri).crop({ originX, originY, width, height }).renderAsync();
      const saved = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
      onDone(saved.uri);
    } catch {
      onDone(image.uri);
    } finally {
      setBusy(false);
    }
  };

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage({ w: width, h: height });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('editor.cancel').en}>
            <Icon name="x" size={24} color="#fff" />
          </Pressable>
          <Text style={[typography.title, styles.title]}>{t('editor.title').en}</Text>
          <View style={styles.rotateRow}>
            <Pressable onPress={() => rotate(-90)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('editor.rotateLeft').en}>
              <Icon name="rotate-ccw" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={() => rotate(90)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('editor.rotateRight').en}>
              <Icon name="rotate-cw" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.stage} onLayout={onStageLayout}>
          {image && fit ? (
            <>
              <Image source={{ uri: image.uri }} style={{ position: 'absolute', left: fit.x, top: fit.y, width: fit.w, height: fit.h }} />
              <View pointerEvents="none" style={[styles.shade, { left: fit.x, top: fit.y, width: fit.w, height: rect.y - fit.y }]} />
              <View pointerEvents="none" style={[styles.shade, { left: fit.x, top: rect.y + rect.h, width: fit.w, height: fit.y + fit.h - rect.y - rect.h }]} />
              <View pointerEvents="none" style={[styles.shade, { left: fit.x, top: rect.y, width: rect.x - fit.x, height: rect.h }]} />
              <View pointerEvents="none" style={[styles.shade, { left: rect.x + rect.w, top: rect.y, width: fit.x + fit.w - rect.x - rect.w, height: rect.h }]} />
              <View {...move.panHandlers} style={[styles.box, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]} />
              <View {...handles.tl.panHandlers} style={[styles.handle, { left: rect.x - HANDLE / 2, top: rect.y - HANDLE / 2 }]} />
              <View {...handles.tr.panHandlers} style={[styles.handle, { left: rect.x + rect.w - HANDLE / 2, top: rect.y - HANDLE / 2 }]} />
              <View {...handles.bl.panHandlers} style={[styles.handle, { left: rect.x - HANDLE / 2, top: rect.y + rect.h - HANDLE / 2 }]} />
              <View {...handles.br.panHandlers} style={[styles.handle, { left: rect.x + rect.w - HANDLE / 2, top: rect.y + rect.h - HANDLE / 2 }]} />
            </>
          ) : (
            <ActivityIndicator color="#fff" />
          )}
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>

        <Text style={[typography.caption, styles.hint]}>{t('editor.hint').en}</Text>
        <Button labelId="editor.done" onPress={finish} disabled={busy || !fit} variant="success" size="lg" fullWidth />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111', paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  title: { color: '#fff', flex: 1 },
  rotateRow: { flexDirection: 'row', gap: spacing.lg },
  stage: { flex: 1, marginBottom: spacing.sm },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#fff' },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  busy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  hint: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: spacing.md },
});
