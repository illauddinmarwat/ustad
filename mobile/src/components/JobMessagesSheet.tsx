import { useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';
import { Icon } from './ui/Icon';
import { KeyboardAvoid } from './ui/KeyboardAvoid';

export type SheetMessage = { id: string; body: string; sender_id: string; created_at: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  messages: SheetMessage[];
  uid: string | null | undefined;
  body: string;
  onBodyChange: (v: string) => void;
  onSend: () => void;
  /** Shown to the two people on the job; omit for anyone else. */
  onReport?: () => void;
};

/** The conversation on an assigned job, opened from the floating message button so it does not lengthen the page. */
export function JobMessagesSheet({ visible, onClose, messages, uid, body, onBodyChange, onSend, onReport }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoid style={styles.root}>
        <View style={[styles.head, { paddingTop: insets.top + spacing.sm }]}>
          <BiText id="jobDetail.messages.title" variant="title" tone="strong" style={styles.title} />
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Icon name="x" size={24} color={colors.textStrong} />
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.list}
          contentContainerStyle={styles.listBody}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <BiText id="jobDetail.messages.empty" variant="body" tone="muted" align="center" />
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === uid;
              return (
                <View key={m.id} style={mine ? styles.rowMine : styles.rowTheirs}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.label, mine ? styles.labelMine : styles.labelTheirs]}>
                      {mine ? t('jobDetail.messages.you').en : t('jobDetail.messages.participant').en}
                    </Text>
                    <Text style={[styles.text, mine && styles.textMine]}>{m.body}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {onReport ? (
          <Pressable onPress={onReport} style={styles.reportRow}>
            <Icon name="flag" size={14} color={colors.danger} />
            <BiText id="jobDetail.messages.report" hideUrdu variant="caption" tone="muted" enStyle={{ color: colors.danger }} />
          </Pressable>
        ) : null}

        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TextInput
            value={body}
            onChangeText={onBodyChange}
            placeholder={t('jobDetail.messages.placeholder').en}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel={t('jobDetail.messages.send').en}
            style={styles.send}
          >
            <Icon name="send" size={18} color={colors.primaryInk} />
          </Pressable>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { flex: 1 },
  list: { flex: 1 },
  listBody: { flexGrow: 1, padding: spacing.lg, gap: spacing.xs, justifyContent: 'flex-end' },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', padding: spacing.sm, borderRadius: radius.md },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.surfaceAlt },
  label: { ...typography.caption, marginBottom: 2 },
  labelMine: { color: 'rgba(255,255,255,0.85)' },
  labelTheirs: { color: colors.textMuted },
  text: { ...typography.body, color: colors.textStrong },
  textMine: { color: colors.primaryInk },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: spacing.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    ...typography.body,
    color: colors.textStrong,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
});
