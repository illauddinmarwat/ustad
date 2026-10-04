import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import type { I18n } from '../lib/i18nText';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { LocalizedText } from './LocalizedText';
import { Icon } from './ui/Icon';

export type ServiceCardProps = {
  headline: string;
  headlineI18n?: I18n;
  workerName?: string | null;
  rating?: number | null;
  reviewCount?: number;
  verified?: boolean;
  jobsDone?: number;
  areas?: string[];
  photos?: string[];
  featured?: boolean;
  /** Your own service: shows its status and an Edit prompt instead of Request a quote. */
  status?: 'active' | 'paused' | 'draft';
  onEdit?: () => void;
  /** Seen by someone who cannot request it (an Ustad): the prompt says View. */
  viewOnly?: boolean;
  onPress: () => void;
};

const MAX_AREAS = 3;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** A service in the Services list: its photo, who offers it, how they are rated, where they work. No price. */
export function ServiceCard({
  headline,
  headlineI18n,
  workerName,
  rating,
  reviewCount = 0,
  verified,
  jobsDone = 0,
  areas = [],
  photos = [],
  featured,
  status,
  onEdit,
  viewOnly,
  onPress,
}: ServiceCardProps) {
  const { t } = useT();
  const cover = photos[0];
  const name = (workerName ?? '').trim();
  const shownAreas = areas.slice(0, MAX_AREAS);
  const moreAreas = areas.length - shownAreas.length;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={headline}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.cover, !cover && styles.coverShort]}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.coverImg} accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.coverFallback}>
            {onEdit ? (
              <>
                <Icon name="image" size={26} color={colors.primary} />
                <Text style={styles.addPhoto}>{t('listing.addPhoto').en}</Text>
              </>
            ) : (
              <Text style={styles.coverInitials}>{initials(name || headline)}</Text>
            )}
          </View>
        )}
        <View style={styles.badges}>
          {featured ? (
            <View style={[styles.badge, styles.badgeWarn]}>
              <Icon name="star" size={11} color="#92400E" />
              <Text style={[styles.badgeText, { color: '#92400E' }]}>Featured</Text>
            </View>
          ) : (
            <View />
          )}
          {photos.length > 1 ? (
            <View style={styles.badge}>
              <Icon name="image" size={11} color="#fff" />
              <Text style={styles.badgeText}>{photos.length}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <LocalizedText original={headline} i18n={headlineI18n} style={styles.headline} numberOfLines={2} compact />

        {name ? (
          <View style={styles.whoRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {verified ? <Icon name="check-circle" size={14} color={colors.primary} /> : null}
          </View>
        ) : null}

        <View style={styles.statRow}>
          {rating != null && rating > 0 ? (
            <View style={styles.stat}>
              <Icon name="star" size={13} color={colors.warning} />
              <Text style={styles.statStrong}>{rating.toFixed(1)}</Text>
              {reviewCount > 0 ? <Text style={styles.statMuted}>({reviewCount})</Text> : null}
            </View>
          ) : (
            <Text style={styles.statMuted}>{t('services.card.new').en}</Text>
          )}
          {jobsDone > 0 ? (
            <Text style={styles.statMuted}>
              {jobsDone} {t('services.jobsDone').en}
            </Text>
          ) : null}
        </View>

        {shownAreas.length > 0 ? (
          <View style={styles.areas}>
            {shownAreas.map((a) => (
              <View key={a} style={styles.area}>
                <Icon name="map-pin" size={11} color={colors.primaryDeep} />
                <Text style={styles.areaText}>{a}</Text>
              </View>
            ))}
            {moreAreas > 0 ? (
              <View style={styles.area}>
                <Text style={styles.areaText}>+{moreAreas}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.foot}>
          {status ? (
            <View style={[styles.statusChip, status === 'active' ? styles.statusOn : styles.statusOff]}>
              <Text style={[styles.statusText, status === 'active' ? styles.statusTextOn : styles.statusTextOff]}>
                {t(`listing.status.${status}`).en}
              </Text>
            </View>
          ) : (
            <Text style={styles.cta}>{t(viewOnly ? 'services.card.view' : 'listing.cta.requestQuote').en}</Text>
          )}
          {onEdit ? (
            <View style={styles.editRow}>
              <Text style={styles.cta}>{t('listing.edit').en}</Text>
              <Icon name="edit-2" size={15} color={colors.primary} />
            </View>
          ) : (
            <Icon name="arrow-right" size={16} color={colors.primary} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.92 },
  cover: { height: 150, backgroundColor: colors.primarySoft },
  coverShort: { height: 96 },
  addPhoto: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: 4 },
  coverImg: { width: '100%', height: '100%' },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  coverInitials: { fontSize: 36, fontWeight: '800', color: colors.primary, opacity: 0.55 },
  badges: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeWarn: { backgroundColor: colors.warningSoft },
  badgeText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  body: { padding: spacing.md, gap: spacing.sm },
  headline: { ...typography.subtitle, color: colors.textStrong },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 9, fontWeight: '800', color: colors.primaryDeep },
  name: { ...typography.bodySm, color: colors.textBody, flexShrink: 1 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statStrong: { ...typography.label, color: colors.textStrong },
  statMuted: { ...typography.caption, color: colors.textMuted },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  areaText: { ...typography.caption, color: colors.primaryDeep, fontWeight: '600' },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  cta: { ...typography.label, color: colors.primary },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusChip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusOn: { backgroundColor: colors.accentSoft },
  statusOff: { backgroundColor: colors.warningSoft },
  statusText: { ...typography.caption, fontWeight: '700' },
  statusTextOn: { color: '#065F46' },
  statusTextOff: { color: '#92400E' },
});
