import { StyleSheet, View } from 'react-native';

import { buildTimeline, type TimelineInput, type Viewer } from '../lib/jobTimeline';
import { colors, radius, spacing } from '../theme/tokens';

import { BiText } from './ui/BiText';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';

type Props = TimelineInput & { viewer: Viewer };

/** Where a job is, step by step, and what happens next for the person looking. English and Urdu. */
export function JobStatusTimeline({ viewer, ...input }: Props) {
  const timeline = buildTimeline(input, viewer);

  return (
    <Card padding="lg">
      <BiText id="timeline.title" variant="title" tone="strong" style={styles.title} />
      <View style={styles.steps}>
        {timeline.steps.map((step, i) => (
          <View key={step.id} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, step.done && styles.dotDone, step.current && styles.dotCurrent]}>
                {step.done ? <Icon name="check" size={12} color="#fff" /> : null}
              </View>
              {i < timeline.steps.length - 1 || timeline.terminal ? (
                <View style={[styles.line, step.done && styles.lineDone]} />
              ) : null}
            </View>
            <BiText
              id={step.labelId}
              variant="label"
              tone={step.done ? 'strong' : step.current ? 'body' : 'muted'}
              style={styles.label}
            />
          </View>
        ))}
        {timeline.terminal ? (
          <View style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, styles.dotBad]}>
                <Icon name="x" size={12} color="#fff" />
              </View>
            </View>
            <BiText
              id={timeline.terminal === 'cancelled' ? 'timeline.step.cancelled' : 'timeline.step.disputed'}
              variant="label"
              tone="strong"
              style={styles.label}
            />
          </View>
        ) : null}
      </View>
      {timeline.nextId ? (
        <View style={styles.next}>
          <BiText id="timeline.next" variant="caption" tone="muted" />
          <BiText id={timeline.nextId} variant="bodySm" tone="strong" />
        </View>
      ) : null}
    </Card>
  );
}

const DOT = 20;

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  steps: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 36 },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotCurrent: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  dotBad: { backgroundColor: colors.danger, borderColor: colors.danger },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2, minHeight: 14 },
  lineDone: { backgroundColor: colors.accent },
  label: { flex: 1, paddingTop: 1 },
  next: {
    gap: 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
