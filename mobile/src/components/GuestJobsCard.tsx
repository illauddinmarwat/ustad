import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { listGuestJobs, type GuestJobRef } from '../lib/jobPosting';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';

/** Jobs posted without an account on this device, so the poster can come back to their quotes. */
export function GuestJobsCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [jobs, setJobs] = useState<GuestJobRef[]>([]);

  useEffect(() => {
    listGuestJobs().then(setJobs);
  }, []);

  if (jobs.length === 0) return null;

  return (
    <Card padding="lg" style={styles.card}>
      <BiText id="posted.myGuestJobs" variant="title" tone="strong" style={styles.title} />
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
});
