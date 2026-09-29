import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './ui/Button';
import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { Icon } from './ui/Icon';

type Props = {
  visible: boolean;
  onAgree: () => void;
  onClose: () => void;
};

export function PrivacyPolicyModal({ visible, onAgree, onClose }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const title = t('privacy.title');
  const body = t('privacy.body');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.title, { color: colors.textStrong }]}>{title.en}</Text>
            <Text style={[urduTypography.label, styles.urdu]}>{title.ur}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Icon name="x" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: spacing.lg }}>
          <Text style={[typography.body, { color: colors.textBody }]}>{body.en}</Text>
          <Text style={[urduTypography.body, styles.urduBody]}>{body.ur}</Text>
        </ScrollView>
        <Button labelId="privacy.agree" onPress={onAgree} variant="success" size="lg" fullWidth />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  urdu: { color: colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  scroll: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  urduBody: { color: colors.textBody, textAlign: "right", writingDirection: "rtl", marginTop: spacing.lg, fontSize: 16, lineHeight: 32 },
});
