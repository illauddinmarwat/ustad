import { useEffect, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { Button } from './ui/Button';
import { ReapplyRegistration } from './ReapplyRegistration';
import { Icon } from './ui/Icon';

const POLL_MS = 30_000;

/** Full-screen lock shown to an Ustad whose registration has not been approved yet. */
export function PendingApprovalGate() {
  const { session, role, workerApprovalStatus, rejectionReason, refreshApproval, signOut, registering } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<'pending' | 'failed' | null>(null);
  const [reapplying, setReapplying] = useState(false);

  const locked = !!session && !registering && role === 'worker' && workerApprovalStatus !== 'approved';
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

  if (rejected && reapplying && session) {
    return (
      <ReapplyRegistration
        userId={session.user.id}
        onSubmitted={() => {
          setReapplying(false);
          void refreshApproval();
        }}
        onClose={() => setReapplying(false)}
      />
    );
  }

  const title = t(rejected ? 'approval.gate.rejectedTitle' : 'approval.gate.title');
  const body = t(rejected ? 'approval.gate.rejectedBody' : 'approval.gate.body');

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      const status = await refreshApproval();
      setResult(status === 'pending' ? 'pending' : status === null ? 'failed' : null);
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
          {rejected ? (
            <View style={styles.reasonBox}>
              <Text style={[typography.label, styles.reasonLabel]}>{t('approval.gate.reasonLabel').en}</Text>
              <Text style={[typography.body, styles.reasonText]}>
                {rejectionReason?.trim() || t('approval.gate.noReason').en}
              </Text>
            </View>
          ) : null}
          {result ? (
            <View style={styles.result}>
              <Banner id={result === 'pending' ? 'approval.gate.stillPending' : 'approval.gate.checkFailed'} tone={result === 'pending' ? 'info' : 'warning'} />
            </View>
          ) : null}
          <View style={styles.actions}>
            {!rejected ? (
              <Button labelId="approval.gate.refresh" onPress={check} loading={checking} fullWidth variant="primary" />
            ) : (
              <Button labelId="approval.gate.reapply" onPress={() => setReapplying(true)} fullWidth variant="success" />
            )}
            <Button labelId="approval.gate.signOut" onPress={() => void signOut()} fullWidth variant="secondary" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  reasonBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  reasonLabel: { color: colors.danger, marginBottom: 2 },
  reasonText: { color: colors.textStrong },
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
  result: { alignSelf: 'stretch', marginTop: spacing.md, marginBottom: -spacing.md },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
});
