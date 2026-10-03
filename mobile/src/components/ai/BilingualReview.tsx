import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import type { Lang } from '../../lib/i18nText';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/Input';

export type ReviewField = { key: string; labelId: StringId; multiline?: boolean };
export type Versions = Record<Lang, Record<string, string>>;

type Props = {
  fields: ReviewField[];
  values: Versions;
  /** Show the "AI draft" badge. */
  ai: boolean;
  /** A language whose other version was edited since, so it may be out of date. */
  stale: Partial<Record<Lang, boolean>>;
  onChange: (lang: Lang, key: string, value: string) => void;
  onUpdate: (lang: Lang) => void;
  updating?: boolean;
  checked: boolean;
  onToggleChecked: () => void;
};

const LABEL: Record<Lang, StringId> = { en: 'review.english', ur: 'review.urdu' };

/** English and Urdu versions to edit, and the tick that says the author checked both. */
export function BilingualReview({ fields, values, ai, stale, onChange, onUpdate, updating, checked, onToggleChecked }: Props) {
  const { t } = useT();
  return (
    <>
      {(['en', 'ur'] as Lang[]).map((lang) => (
        <Card key={lang} padding="lg">
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <Icon name="globe" size={16} color={colors.textMuted} />
              <Text style={styles.lang}>{t(LABEL[lang]).en}</Text>
            </View>
            {ai ? <Chip label={t('ai.badge').en} tone="info" icon="zap" /> : null}
          </View>
          {fields.map((f) => (
            <Input
              key={f.key}
              labelId={f.labelId}
              value={values[lang][f.key] ?? ''}
              onChangeText={(v) => onChange(lang, f.key, v)}
              multiline={f.multiline}
              numberOfLines={f.multiline ? 4 : 1}
              style={[f.multiline ? styles.multiline : null, lang === 'ur' ? styles.rtl : null]}
            />
          ))}
          {stale[lang] ? (
            <View style={styles.stale}>
              <Banner id="review.stale" tone="warning" />
              <Button
                labelId="review.updateTranslation"
                onPress={() => onUpdate(lang)}
                variant="secondary"
                iconLeft="refresh-cw"
                size="sm"
                disabled={updating}
                hideUrdu
              />
            </View>
          ) : null}
        </Card>
      ))}
      <Pressable
        onPress={onToggleChecked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={styles.check}
      >
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <Icon name="check" size={14} color={colors.primaryInk} /> : null}
        </View>
        <View style={styles.checkText}>
          <Text style={styles.checkEn}>{t('review.checked').en}</Text>
          <Text style={styles.checkUr}>{t('review.checked').ur}</Text>
        </View>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  lang: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  stale: { gap: spacing.sm, marginTop: spacing.sm },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { flex: 1 },
  checkEn: { ...typography.label, color: colors.textStrong },
  checkUr: { ...typography.caption, color: colors.textMuted, textAlign: 'right' },
});
