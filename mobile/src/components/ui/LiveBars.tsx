import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../../theme/tokens';

import { motionEnabled } from './motion';

const HEIGHTS = [0.5, 0.9, 0.6, 1, 0.7];

/** A few bars that dance while something is being recorded, so the person can see it is listening. */
export function LiveBars() {
  const values = useRef(HEIGHTS.map(() => new Animated.Value(0.4))).current;

  useEffect(() => {
    if (!motionEnabled) return;
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 320 + i * 70, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320 + i * 70, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values]);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <Animated.View key={i} style={[styles.bar, { height: 18 * HEIGHTS[i], transform: [{ scaleY: v }] }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, marginHorizontal: 6 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.danger },
});
