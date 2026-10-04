import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';

import { motionEnabled } from './motion';

/** A grey block that gently pulses while content is on its way. */
export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (!motionEnabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/** A card-shaped placeholder: a title line, two text lines. */
export function SkeletonCard() {
  return (
    <View style={styles.card} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <SkeletonBlock style={styles.title} />
      <SkeletonBlock style={styles.line} />
      <SkeletonBlock style={[styles.line, styles.short]} />
    </View>
  );
}

/** Several card placeholders for a list that is loading. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.border, borderRadius: radius.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { height: 18, width: '55%' },
  line: { height: 12, width: '90%' },
  short: { width: '60%' },
  list: { gap: spacing.md },
});
