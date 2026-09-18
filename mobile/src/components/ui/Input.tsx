import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

import { Icon, type IconProps } from './Icon';

export type InputProps = Omit<TextInputProps, 'placeholder'> & {
  /** Translation id used for the field label (rendered above) — optional. */
  labelId?: StringId;
  /** Translation id used for the placeholder (EN only inside the input). */
  placeholderId?: StringId;
  /** Free-form placeholder fallback when there isn't a translated id. */
  placeholder?: string;
  /** Optional leading icon. */
  iconLeft?: IconProps['name'];
  /** Optional error string shown below the field. */
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  /** Hide the small Urdu translation of the placeholder shown below the field — use when the field sits directly on a colored background where that muted text loses contrast. */
  hideUrduHint?: boolean;
};

export function Input({
  labelId,
  placeholderId,
  placeholder,
  iconLeft,
  error,
  containerStyle,
  hideUrduHint,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const { t } = useT();
  const [focused, setFocused] = useState(false);
  const labelEntry = labelId ? t(labelId) : null;
  const placeholderEntry = placeholderId ? t(placeholderId) : null;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {labelEntry ? (
        <View style={styles.labelBlock}>
          <Text style={[typography.label, { color: colors.textBody }]}>{labelEntry.en}</Text>
          <Text style={[urduTypography.label, styles.urduLabel]}>{labelEntry.ur}</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.fieldRow,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}
      >
        {iconLeft ? (
          <View style={styles.iconLeft}>
            <Icon name={iconLeft} size={18} color={colors.textMuted} />
          </View>
        ) : null}
        <TextInput
          placeholder={placeholderEntry?.en ?? placeholder}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            iconLeft ? styles.inputWithIcon : null,
            style,
          ]}
          {...rest}
        />
      </View>
      {placeholderEntry && !hideUrduHint ? (
        <Text style={[urduTypography.caption, styles.urduPlaceholder]}>{placeholderEntry.ur}</Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  labelBlock: { marginBottom: 4 },
  urduLabel: {
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldFocused: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  fieldError: {
    borderColor: colors.danger,
  },
  iconLeft: { marginRight: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.textStrong,
    ...typography.body,
  },
  inputWithIcon: { paddingLeft: 0 },
  urduPlaceholder: {
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 4,
  },
});
