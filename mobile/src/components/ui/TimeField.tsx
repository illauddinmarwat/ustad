import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import { Icon } from './Icon';

type Props = {
  label: string;
  /** Minutes since midnight. */
  value: number;
  onChange: (minutes: number) => void;
};

export function formatMinutes(total: number): string {
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

function toDate(minutes: number): Date {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function parseHm(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

export function TimeField({ label, value, onChange }: Props) {
  const [iosOpen, setIosOpen] = useState(false);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'time',
        is24Hour: false,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(date.getHours() * 60 + date.getMinutes());
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      {Platform.OS === 'web' ? (
        <View style={styles.field}>
          <Icon name="clock" size={18} color={colors.textMuted} />
          <TextInput
            defaultValue={`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`}
            onChangeText={(text) => {
              const parsed = parseHm(text);
              if (parsed !== null) onChange(parsed);
            }}
            placeholder="HH:MM"
            placeholderTextColor={colors.textMuted}
            style={[typography.body, styles.webInput]}
          />
        </View>
      ) : (
        <Pressable onPress={open} accessibilityRole="button" style={styles.field}>
          <Icon name="clock" size={18} color={colors.textMuted} />
          <Text style={[typography.body, styles.value]}>{formatMinutes(value)}</Text>
        </Pressable>
      )}

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <DateTimePicker
                value={toDate(value)}
                mode="time"
                display="spinner"
                onChange={(_e, date) => {
                  if (date) onChange(date.getHours() * 60 + date.getMinutes());
                }}
              />
              <Pressable onPress={() => setIosOpen(false)} style={styles.done} accessibilityRole="button">
                <Text style={[typography.button, { color: colors.primaryInk }]}>OK</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
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
  value: { color: colors.textStrong },
  webInput: { flex: 1, color: colors.textStrong },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  done: { backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
});
