import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StringId } from '../../i18n/strings';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';
import { BiText } from '../ui/BiText';
import { Button } from '../ui/Button';

export type WizardShellProps = {
  /** 1-based current step. */
  step: number;
  total: number;
  /** Name of the current step. */
  stepNameId: StringId;
  /** Label of the forward button. Defaults to "Next". */
  nextLabelId?: StringId;
  nextIcon?: 'send' | 'arrow-right' | 'check';
  onNext: () => void;
  onBack?: () => void;
  /** Disables Next (for example while posting). */
  busy?: boolean;
  nextDisabled?: boolean;
  /** Banners shown above the step content. */
  top?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * A full-screen step of a wizard: progress, the step's content, and a
 * Back / Next footer. Wizards live on root-stack routes, so the tab bar is
 * already out of the way and the form gets the whole screen.
 */
export function WizardShell({
  step,
  total,
  stepNameId,
  nextLabelId = 'wizard.next',
  nextIcon = 'arrow-right',
  onNext,
  onBack,
  busy,
  nextDisabled,
  top,
  children,
}: WizardShellProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.headRow}>
          <Text style={styles.stepEn}>{`Step ${step} of ${total}`}</Text>
          <Text style={styles.stepUr}>{`مرحلہ ${step} از ${total}`}</Text>
        </View>
        <View style={styles.bars} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.bar, i < step && styles.barOn]} />
          ))}
        </View>
        <BiText id={stepNameId} variant="title" tone="strong" style={styles.name} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {top}
        {children}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.md }]}>
        {onBack ? (
          <Button labelId="wizard.back" variant="secondary" onPress={onBack} disabled={busy} style={styles.back} />
        ) : null}
        <Button
          labelId={nextLabelId}
          onPress={onNext}
          iconRight={nextIcon === 'arrow-right' ? 'arrow-right' : undefined}
          iconLeft={nextIcon === 'arrow-right' ? undefined : nextIcon}
          disabled={busy || nextDisabled}
          style={styles.next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stepEn: { ...typography.label, color: colors.textMuted },
  stepUr: { ...urduTypography.label, color: colors.textMuted },
  bars: { flexDirection: 'row', gap: spacing.xs },
  bar: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.border },
  barOn: { backgroundColor: colors.primary },
  name: { marginTop: spacing.xs },
  body: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  foot: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  back: { flex: 1 },
  next: { flex: 2 },
});
