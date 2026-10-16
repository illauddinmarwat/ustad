import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../i18n/useT';
import { REPORT_REASONS, submitReport, type ReportReason, type ReportTarget } from '../lib/reports';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

type Props = {
  visible: boolean;
  /** Who and what is being reported; null while the screen has not worked it out yet. */
  target: ReportTarget | null;
  onClose: () => void;
};

/** Pick a reason, add an optional note, send it to the admin moderation queue. */
export function ReportSheet({ visible, target, onClose }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => {
    setReason(null);
    setNote('');
    setError(null);
    setSent(false);
    onClose();
  };

  const send = async () => {
    if (!reason || !target) return;
    setBusy(true);
    setError(null);
    try {
      await submitReport(target, reason, note);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <BiText id="report.title" variant="title" tone="strong" />
            {sent ? (
              <View style={styles.gap}>
                <Banner id="report.done" tone="success" />
                <Button labelId="common.cancel" onPress={close} variant="secondary" fullWidth style={styles.gap} />
              </View>
            ) : (
              <>
                <BiText id="report.subtitle" variant="bodySm" tone="muted" style={styles.gap} />
                {REPORT_REASONS.map((r) => {
                  const on = reason === r.code;
                  const entry = t(r.labelId);
                  return (
                    <Pressable
                      key={r.code}
                      onPress={() => setReason(r.code)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[styles.option, on && styles.optionOn]}
                    >
                      <Icon name={on ? 'check-circle' : 'circle'} size={18} color={on ? colors.primary : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySm, { color: colors.textStrong }]}>{entry.en}</Text>
                        <Text style={[urduTypography.bodySm, styles.urdu]}>{entry.ur}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('report.note').en}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                  style={styles.note}
                />
                {error ? <Banner text={error} tone="danger" /> : null}
                <View style={styles.row}>
                  <Button labelId="common.cancel" onPress={close} variant="secondary" style={styles.flex} />
                  <Button
                    labelId="report.send"
                    onPress={send}
                    loading={busy}
                    disabled={!reason || !target || busy}
                    variant="danger"
                    style={styles.flex}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  gap: { marginTop: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  urdu: { color: colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  note: {
    ...typography.body,
    color: colors.textStrong,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 72,
    marginTop: spacing.md,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flex: { flex: 1 },
});
