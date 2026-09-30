import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InboxSection } from '../../components/InboxSection';
import { BiText } from '../../components/ui/BiText';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { fetchJobPostingEnabled } from '../../lib/jobPosting';
import { colors, radius, spacing } from '../../theme/tokens';
import { JobBoardList } from '../app/JobBoardScreen';

type Segment = 'open' | 'mine';

/** Ustad Jobs tab: the open job board and the Ustad's own applications/quotes/jobs in one place. */
export default function WorkerJobsScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [boardEnabled, setBoardEnabled] = useState<boolean | null>(null);
  const [segment, setSegment] = useState<Segment>('mine');
  const uid = session?.user.id;

  useEffect(() => {
    fetchJobPostingEnabled().then((on) => {
      setBoardEnabled(on);
      if (on) setSegment('open');
    });
  }, []);

  const segments: { key: Segment; id: StringId }[] = [
    ...(boardEnabled ? [{ key: 'open' as const, id: 'jobs.segment.open' as StringId }] : []),
    { key: 'mine', id: 'jobs.segment.mine' },
  ];

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <BiText id="jobs.title" variant="displayLg" tone="strong" />
      {segments.length > 1 ? (
        <View style={styles.segments}>
          {segments.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setSegment(s.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: segment === s.key }}
              style={[styles.seg, segment === s.key && styles.segOn]}
            >
              <BiText id={s.id} hideUrdu variant="label" enStyle={segment === s.key ? styles.segTextOn : styles.segText} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {segment === 'open' && boardEnabled ? <JobBoardList /> : uid ? <InboxSection userId={uid} role="worker" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.md },
  segments: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.primary },
  segText: { color: colors.textBody },
  segTextOn: { color: colors.primaryInk },
});
