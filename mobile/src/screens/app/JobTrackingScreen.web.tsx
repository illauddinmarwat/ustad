import { StyleSheet, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, spacing } from '../../theme/tokens';

/**
 * `react-native-maps` has no web implementation, so importing it breaks the
 * whole Metro web bundle (not just this screen) if pulled in unconditionally.
 * This `.web.tsx` sibling is picked automatically by Metro's platform
 * resolution on web builds; the native map UI lives in
 * `JobTrackingScreen.native.tsx` and is untouched.
 */
export default function JobTrackingScreen() {
  return (
    <View style={styles.root}>
      <Card padding="lg">
        <EmptyState icon="smartphone" titleId="tracking.web.unavailable" subtitleId="tracking.web.unavailable.subtitle" />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, backgroundColor: colors.bg, justifyContent: 'center' },
});
