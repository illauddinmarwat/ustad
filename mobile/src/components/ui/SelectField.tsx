import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import { Icon } from './Icon';

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  extraOption?: SelectOption;
  iconLeft?: 'map-pin' | 'map';
};

export function SelectField({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  loading,
  failed,
  onRetry,
  extraOption,
  iconLeft = 'map-pin',
}: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected =
    options.find((o) => o.value === value) ?? (extraOption && extraOption.value === value ? extraOption : null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const data = extraOption && !query.trim() ? [...filtered, extraOption] : filtered;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.wrap}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <Pressable
        onPress={() => {
          if (failed && onRetry) onRetry();
          else if (!disabled) setOpen(true);
        }}
        accessibilityRole="button"
        style={[styles.field, disabled && styles.fieldDisabled]}
      >
        <Icon name={iconLeft} size={18} color={colors.textMuted} />
        <Text numberOfLines={1} style={[typography.body, styles.value, !selected && styles.placeholder]}>
          {failed ? t('pick.loadFailed').en : loading ? '…' : (selected?.label ?? placeholder)}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={[typography.title, { color: colors.textStrong }]}>{label}</Text>
              <Pressable onPress={close} accessibilityRole="button" hitSlop={10}>
                <Icon name="x" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            {options.length > 8 ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('pick.search').en}
                placeholderTextColor={colors.textMuted}
                style={[typography.body, styles.search]}
              />
            ) : null}
            <FlatList
              data={data}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[typography.body, styles.empty]}>{t('pick.empty').en}</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  style={styles.option}
                  accessibilityRole="button"
                >
                  <Text style={[typography.body, { color: colors.textStrong }, item.value === value && styles.optionOn]}>
                    {item.label}
                  </Text>
                  {item.value === value ? <Icon name="check" size={18} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  label: { color: colors.textBody, marginBottom: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldDisabled: { opacity: 0.5 },
  value: { flex: 1, color: colors.textStrong },
  placeholder: { color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '75%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.textStrong,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionOn: { fontWeight: '700', color: colors.primaryDeep },
  empty: { color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center' },
});
