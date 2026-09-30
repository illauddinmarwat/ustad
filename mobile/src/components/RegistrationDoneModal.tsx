import { Modal, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

type Props = {
  visible: boolean;
  /** Some photos could not be uploaded and will be retried at next sign-in. */
  uploadWarning?: boolean;
  onClose: () => void;
};

/** Shown after an Ustad submits registration; closing it sends them to the sign-in screen. */
export function RegistrationDoneModal({ visible, uploadWarning, onClose }: Props) {
  const { t } = useT();
  const title = t('register.done.title');
  const body = t('register.done.body');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Icon name="check-circle" size={32} color={colors.primary} />
          </View>
          <Text style={[typography.title, styles.title]}>{title.en}</Text>
          <Text style={[urduTypography.title, styles.urdu]}>{title.ur}</Text>
          <Text style={[typography.body, styles.body]}>{body.en}</Text>
          <Text style={[urduTypography.body, styles.urduBody]}>{body.ur}</Text>
          {uploadWarning ? (
            <View style={styles.warning}>
              <Banner id="register.uploadWarning" tone="warning" />
            </View>
          ) : null}
          <Button labelId="register.done.close" onPress={onClose} variant="success" size="lg" fullWidth style={styles.btn} />
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
  title: { color: colors.textStrong, textAlign: 'center' },
  urdu: { color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  body: { color: colors.textBody, textAlign: 'center', marginTop: spacing.md },
  urduBody: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  warning: { alignSelf: 'stretch', marginTop: spacing.md, marginBottom: -spacing.sm },
  btn: { marginTop: spacing.lg },
});
