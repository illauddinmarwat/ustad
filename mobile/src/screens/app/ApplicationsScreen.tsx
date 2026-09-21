import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InboxSection } from '../../components/InboxSection';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { fetchJobPostingEnabled } from '../../lib/jobPosting';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';

/** The Inbox tab: everything waiting on you or in progress, from all three flows, for customers and workers. */
export default function ApplicationsScreen() {
  const { session, role } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [boardEnabled, setBoardEnabled] = useState(false);

  useEffect(() => {
    fetchJobPostingEnabled().then(setBoardEnabled);
  }, []);

  const uid = session?.user.id;
  const inboxRole = role === 'worker' ? 'worker' : role === 'customer' ? 'customer' : null;

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScreenHeader titleId="applications.title" subtitleId="applications.subtitle" />

      {!uid && (
        <Card padding="lg">
          <EmptyState icon="log-in" titleId="applications.signInRequired" subtitleId="applications.signInPrompt" />
        </Card>
      )}

      {uid && !inboxRole && (
        <Card padding="lg">
          <EmptyState icon="lock" titleId="applications.roleRequired" subtitleId="applications.roleSwitch" />
        </Card>
      )}

      {uid && role === 'worker' && boardEnabled ? (
        <Button labelId="board.cta" onPress={() => navigation.navigate('JobBoard')} variant="secondary" iconLeft="briefcase" fullWidth />
      ) : null}

      {uid && inboxRole ? <InboxSection userId={uid} role={inboxRole} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.md },
});
