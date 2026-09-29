import { useEffect, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

const POLL_MS = 30_000;

/** Full-screen lock shown to an Ustad whose registration has not been approved yet. */
export function PendingApprovalGate() {
  const { session, role, workerApprovalStatus, refreshApproval, signOut } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);

  const locked = !!session && role === 'worker' && workerApprovalStatus !== 'approved';
  const rejected = workerApprovalStatus === 'rejected';

  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => void refreshApproval(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshApproval();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [locked, refreshApproval]);

  if (!locked) return null;

  const title = t(rejected ? 'approval.gate.rejectedTitle' : 'approval.gate.title');
  const body = t(rejected ? 'approval.gate.rejectedBody' : 'approval.gate.body');

  const check = async () => {
    setChecking(true);
    try {
      await refreshApproval();
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, rejected && styles.iconWrapDanger]}>
            <Icon name={rejected ? 'x-circle' : 'clock'} size={30} color={rejected ? colors.danger : colors.primary} />
          </View>
          <Text style={[typography.title, styles.title]}>{title.en}</Text>
          <Text style={[urduTypography.title, styles.urdu]}>{title.ur}</Text>
          <Text style={[typography.body, styles.body]}>{body.en}</Text>
          <Text style={[urduTypography.body, styles.urduBody]}>{body.ur}</Text>
          <View style={styles.actions}>
            {!rejected ? (
              <Button labelId="approval.gate.refresh" onPress={check} loading={checking} fullWidth variant="primary" />
            ) : null}
            <Button labelId="approval.gate.signOut" onPress={() => void signOut()} fullWidth variant="secondary" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 30, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconWrapDanger: { backgroundColor: colors.dangerSoft },
  title: { color: colors.textStrong, textAlign: 'center' },
  urdu: { color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  body: { color: colors.textBody, textAlign: 'center', marginTop: spacing.md },
  urduBody: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
});
