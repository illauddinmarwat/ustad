import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n/useT';
import { useGuestQuoteCount } from '../lib/guestQuotes';
import { listGuestJobs, type GuestJobRef } from '../lib/jobPosting';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';

/** Jobs posted without an account on this device, so the poster can come back to their quotes. */
export function GuestJobsCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const { t } = useT();
  const [jobs, setJobs] = useState<GuestJobRef[]>([]);
  const { byToken } = useGuestQuoteCount(!session && jobs.length > 0);

  useEffect(() => {
    listGuestJobs().then(setJobs);
  }, []);

  if (jobs.length === 0) return null;

  return (
    <Card padding="lg" style={styles.card}>
      <BiText id="posted.myGuestJobs" variant="title" tone="strong" style={styles.title} />
      {!session ? (
        <View style={styles.nudge}>
          <BiText id="posted.notify.title" variant="label" tone="strong" />
          <BiText id="posted.notify.body" variant="caption" tone="muted" />
          <Button labelId="posted.notify.cta" onPress={() => navigation.navigate('Auth')} variant="secondary" iconLeft="user-plus" fullWidth />
        </View>
      ) : null}
      {jobs.map((j) => (
        <Pressable
          key={j.token}
          onPress={() => navigation.navigate('PostedJob', { jobId: j.jobId, token: j.token })}
          accessibilityRole="button"
          style={styles.row}
        >
          <Text style={styles.text} numberOfLines={1}>
            {j.title}
          </Text>
          {byToken[j.token] ? (
            <View style={styles.waiting}>
              <Text style={styles.waitingText}>
                {byToken[j.token]} {t(byToken[j.token] === 1 ? 'posted.quotesWaiting' : 'posted.quotesWaitingMany').en}
              </Text>
            </View>
          ) : null}
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  title: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  text: { ...typography.body, color: colors.textStrong, flex: 1, marginRight: spacing.sm },
  nudge: { gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm },
  waiting: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2, marginRight: spacing.sm },
  waitingText: { ...typography.caption, color: '#fff', fontWeight: '700' },
});
