import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { colors, spacing } from '../../theme/tokens';

import { BiText } from './BiText';
import { Card } from './Card';
import { Icon } from './Icon';

type Props = {
  titleId: StringId;
  /** Open on first show. Sections that need action start open; finished or optional ones start folded. */
  defaultOpen?: boolean;
  children: ReactNode;
};

/** A card whose title row folds the content away, so a long page shows what matters now and keeps the rest a tap away. */
export function FoldCard({ titleId, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding="lg">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <BiText id={titleId} variant="title" tone="strong" style={styles.title} />
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1 },
  body: { marginTop: spacing.md },
});
