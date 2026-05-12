import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { fetchCommunityTips } from '../../lib/community';
import type { CommunityTip } from '../../lib/communityLite';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

export default function CommunityTipsScreen() {
  const [tips, setTips] = useState<CommunityTip[]>([]);
  const [errored, setErrored] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchCommunityTips()
      .then((data) => setTips(data))
      .catch(() => setErrored(true));
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScreenHeader titleId="community.title" subtitleId="community.subtitle" />

      {errored && <Banner id="community.error.load" tone="danger" />}

      <Card padding="lg">
        {tips.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="map" size={28} color={colors.textMuted} />
            <BiText id="community.empty" variant="body" tone="muted" align="center" style={styles.emptyText} />
          </View>
        ) : (
          tips.map((tip, idx) => (
            <View key={tip.id} style={[styles.tipRow, idx === 0 && styles.tipRowFirst]}>
              <View style={styles.tipHead}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <View style={styles.tipChips}>
                  <Chip label={tip.city_code.toUpperCase()} tone="primary" icon="map-pin" />
                  <Chip label={tip.lang} tone="neutral" />
                </View>
              </View>
              <Text style={styles.tipBody}>{tip.body}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  empty: { paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm },
  emptyText: { alignSelf: 'stretch' },
  tipRow: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  tipRowFirst: { borderTopWidth: 0, paddingTop: 0 },
  tipHead: { gap: spacing.xs },
  tipTitle: { ...typography.subtitle, color: colors.textStrong },
  tipChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tipBody: { ...typography.body, color: colors.textBody },
});
