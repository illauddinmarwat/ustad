import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = { children: ReactNode; style?: StyleProp<ViewStyle> };

/** How far the bottom of a view sits below the top of the keyboard (0 when it is already clear of it). */
export function keyboardOverlap(viewBottom: number, keyboardTop: number | null): number {
  if (keyboardTop == null) return 0;
  return Math.max(0, Math.round(viewBottom - keyboardTop));
}

/**
 * Keeps the screen's content above the on-screen keyboard. Android may or may not shrink the window for the keyboard
 * (it does with adjustResize, and edge-to-edge builds vary), and padding blindly on top of a resize leaves a big empty
 * gap. So this measures where its own bottom edge really is against the top of the keyboard and pads by only the part
 * that is still covered. Wrap a screen's root in this.
 */
export function KeyboardAvoid({ children, style }: Props) {
  const ref = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [pad, setPad] = useState(0);

  const update = useCallback(() => {
    if (keyboardTop.current == null) {
      setPad(0);
      return;
    }
    ref.current?.measureInWindow((_x, y, _w, h) => {
      if (keyboardTop.current != null) setPad(keyboardOverlap(y + h, keyboardTop.current));
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      update();
      // The window can finish resizing after the event; measure again once it has settled.
      setTimeout(update, 200);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = null;
      setPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [update]);

  // A resize of the window changes this view's layout, which is the cue to measure again.
  return (
    <View ref={ref} collapsable={false} onLayout={update} style={[styles.flex, style, { paddingBottom: pad }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
