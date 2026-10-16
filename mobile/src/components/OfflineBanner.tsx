import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnline } from '../lib/useOnline';
import { spacing } from '../theme/tokens';

import { Banner } from './ui/Banner';

/** A thin warning pinned under the status bar while the backend is unreachable. Does not block touches. */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.xs }]}>
      <Banner id="net.offline" tone="warning" icon="wifi-off" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 1000 },
});
