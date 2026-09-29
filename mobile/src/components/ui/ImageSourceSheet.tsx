import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../i18n/useT';
import type { ImageSource } from '../../lib/pickImage';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import { Icon } from './Icon';

type Props = {
  visible: boolean;
  onPick: (source: ImageSource) => void;
  onClose: () => void;
};

export function ImageSourceSheet({ visible, onPick, onClose }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={() => {}}>
          <Row icon="camera" label={t('image.takePhoto').en} onPress={() => onPick('camera')} />
          <Row icon="image" label={t('image.chooseGallery').en} onPress={() => onPick('gallery')} />
          <Row icon="x" label={t('image.cancel').en} onPress={onClose} muted />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  muted,
}: {
  icon: 'camera' | 'image' | 'x';
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <Icon name={icon} size={20} color={muted ? colors.textMuted : colors.primary} />
      <Text style={[typography.body, { color: muted ? colors.textMuted : colors.textStrong }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
