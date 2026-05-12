import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { useLiveDatabase } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { ensureAuthenticated, ensureRole } from '../../lib/authGuards';
import { fetchPhase4Flags } from '../../lib/phase4Flags';
import { supabase } from '../../lib/supabase';
import { buildCheckoutUrl } from '../../lib/webCheckout';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type ListingRow = {
  id: string;
  headline: string;
  detail_text: string | null;
  price_pkr: number;
  worker_id: string;
  template_id: string;
  status: string;
};

type TemplateRow = { title: string; category: string };
type ProfileRow = { display_name: string | null };

type Props = NativeStackScreenProps<RootStackParamList, 'ListingDetail'>;

type Msg = { kind: 'id'; id: StringId; tone: 'info' | 'success' | 'warning' | 'danger' }
  | { kind: 'text'; text: string; tone: 'info' | 'success' | 'warning' | 'danger' }
  | null;

export default function ListingDetailScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const { role, session } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [listing, setListing] = useState<ListingRow | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [note, setNote] = useState('');
  const [locationText, setLocationText] = useState('Lahore');
  const [preferredTime, setPreferredTime] = useState('Flexible');
  const [banner, setBanner] = useState<Msg>(null);
  const [phase4WebEnabled, setPhase4WebEnabled] = useState(false);
  const [webCheckoutLink, setWebCheckoutLink] = useState<string | null>(null);

  const bannerId = (id: StringId, tone: 'info' | 'success' | 'warning' | 'danger' = 'info') =>
    setBanner({ kind: 'id', id, tone });
  const bannerText = (text: string, tone: 'info' | 'success' | 'warning' | 'danger' = 'warning') =>
    setBanner({ kind: 'text', text, tone });

  const load = useCallback(async () => {
    if (!useLiveDatabase) return;
    const { data: l, error } = await supabase
      .from('worker_service_listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();
    if (error || !l) {
      setListing(null);
      if (error) bannerText(error.message, 'danger');
      else bannerId('listing.notFound', 'warning');
      return;
    }
    setListing(l as ListingRow);
    setBanner(null);

    const { data: tplRow } = await supabase
      .from('service_templates')
      .select('title,category')
      .eq('id', l.template_id)
      .maybeSingle();
    setTpl(tplRow as TemplateRow | null);

    const { data: p } = await supabase.from('profiles').select('display_name').eq('id', l.worker_id).maybeSingle();
    setWorkerName((p as ProfileRow | null)?.display_name ?? null);
  }, [listingId]);

  useEffect(() => {
    load().catch(() => bannerId('listing.error.load', 'danger'));
  }, [load]);

  useEffect(() => {
    fetchPhase4Flags()
      .then((flags) => setPhase4WebEnabled(flags.webEnabled))
      .catch(() => setPhase4WebEnabled(false));
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: listing?.headline ?? t('nav.service').en });
  }, [navigation, listing?.headline, t]);

  const submitApply = async () => {
    const uid = session?.user.id;
    if (
      !ensureAuthenticated({
        userId: uid,
        message: 'Sign in to apply for this service.',
        setMessage: () => bannerId('listing.gate.applySignIn', 'warning'),
        goToAuth: () => navigation.navigate('Auth'),
      })
    ) {
      return;
    }
    if (
      !ensureRole({
        role,
        requiredRole: 'customer',
        roleMessage: 'Switch to customer role to apply for services.',
        setMessage: () => bannerId('listing.gate.applyRole', 'warning'),
      })
    ) {
      return;
    }
    const { error } = await supabase.from('listing_applications').insert({
      listing_id: listingId,
      customer_id: uid!,
      note: note.trim() || null,
      location_text: locationText.trim() || null,
      preferred_time: preferredTime.trim() || null,
    });
    if (error) {
      bannerText(error.message, 'danger');
    } else {
      bannerId('listing.toast.applied', 'success');
      await trackEvent('listing_applied', uid!, { listing_id: listingId });
      await trackEvent('ranking_applied', uid!, { listing_id: listingId });
      setApplyOpen(false);
      setNote('');
    }
  };

  const createWebCheckout = async () => {
    const uid = session?.user.id;
    if (
      !ensureAuthenticated({
        userId: uid,
        message: 'Sign in to create web checkout.',
        setMessage: () => bannerId('listing.gate.applySignIn', 'warning'),
        goToAuth: () => navigation.navigate('Auth'),
      })
    ) {
      return;
    }
    if (
      !ensureRole({
        role,
        requiredRole: 'customer',
        roleMessage: 'Switch to customer role to continue checkout.',
        setMessage: () => bannerId('listing.gate.applyRole', 'warning'),
      })
    ) {
      return;
    }
    const { data, error } = await supabase.rpc('create_web_checkout_session', {
      p_listing_id: listingId,
      p_metadata: { source: 'native_listing_detail' },
    });
    if (error || !Array.isArray(data) || data.length === 0) {
      bannerText(error?.message ?? 'Unable to create web checkout session', 'danger');
      return;
    }
    const row = data[0] as { checkout_path: string };
    const url = buildCheckoutUrl(row.checkout_path);
    setWebCheckoutLink(url);
    bannerId('listing.toast.applied', 'success');
    await trackEvent('phase4_web_checkout_session_created', uid!, {
      listing_id: listingId,
      checkout_path: row.checkout_path,
    });
  };

  if (!useLiveDatabase) {
    return (
      <View style={styles.center}>
        <EmptyState icon="wifi-off" titleId="listing.offline" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.center}>
        <BiText id="common.loading" variant="body" tone="muted" align="center" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Card padding="lg">
        <View style={styles.headerRow}>
          <Avatar name={workerName ?? listing.headline} tone="primary" size={48} />
          <View style={styles.headerBody}>
            <Text style={styles.title} numberOfLines={2}>{listing.headline}</Text>
            {tpl ? (
              <View style={styles.tagsRow}>
                <Chip label={tpl.category} tone="primary" icon="tag" />
                <Chip label={tpl.title} tone="neutral" />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.priceRow}>
          <View>
            <BiText id="services.list.fromRs" hideUrdu variant="caption" tone="muted" />
            <Text style={styles.price}>Rs {listing.price_pkr}</Text>
          </View>
          <View style={styles.posted}>
            <BiText id="listing.postedBy" hideUrdu variant="caption" tone="muted" />
            <Text style={styles.postedName} numberOfLines={1}>
              {workerName ?? t('listing.workerFallback').en}
            </Text>
          </View>
        </View>

        {listing.detail_text ? <Text style={styles.body}>{listing.detail_text}</Text> : null}
      </Card>

      {banner ? (
        banner.kind === 'id' ? (
          <Banner id={banner.id} tone={banner.tone} />
        ) : (
          <Banner text={banner.text} tone={banner.tone} />
        )
      ) : null}

      {!session?.user.id && (
        <Card padding="lg">
          <EmptyState
            icon="user-plus"
            titleId="listing.signInRequired"
            subtitleId="listing.signInPrompt"
            ctaLabelId="common.signInOrCreate"
            onCta={() => navigation.navigate('Auth')}
          />
        </Card>
      )}

      {role === 'customer' && (
        <View style={styles.actionsCol}>
          <Button
            labelId="listing.cta.apply"
            onPress={() => setApplyOpen(true)}
            size="lg"
            iconRight="arrow-right"
            fullWidth
          />
          {phase4WebEnabled && (
            <>
              <Button
                labelId="listing.cta.webCheckout"
                onPress={createWebCheckout}
                variant="secondary"
                iconLeft="external-link"
                fullWidth
                style={styles.secondaryAction}
              />
              {webCheckoutLink ? <Text style={styles.webLink}>{webCheckoutLink}</Text> : null}
            </>
          )}
        </View>
      )}

      <Modal visible={applyOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <BiText id="listing.modal.title" variant="title" tone="strong" />
            <BiText id="listing.modal.subtitle" variant="bodySm" tone="muted" style={styles.modalSubtitle} />

            <View style={styles.modalField}>
              <Text style={styles.fieldLabelEn}>{t('listing.modal.notes').en}</Text>
              <Text style={styles.fieldLabelUr}>{t('listing.modal.notes').ur}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('listing.modal.notes').en}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabelEn}>{t('listing.modal.area').en}</Text>
              <Text style={styles.fieldLabelUr}>{t('listing.modal.area').ur}</Text>
              <TextInput
                value={locationText}
                onChangeText={setLocationText}
                placeholder={t('listing.modal.area').en}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabelEn}>{t('listing.modal.time').en}</Text>
              <Text style={styles.fieldLabelUr}>{t('listing.modal.time').ur}</Text>
              <TextInput
                value={preferredTime}
                onChangeText={setPreferredTime}
                placeholder={t('listing.modal.time').en}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={styles.modalRow}>
              <Button
                labelId="common.cancel"
                onPress={() => setApplyOpen(false)}
                variant="secondary"
                style={styles.flex1}
              />
              <Button
                labelId="common.submit"
                onPress={submitApply}
                iconRight="send"
                style={styles.flex1}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  headerBody: { flex: 1, marginLeft: spacing.md },
  title: { ...typography.displayMd, color: colors.textStrong, marginBottom: spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  posted: { alignItems: 'flex-end' },
  price: { ...typography.displayMd, color: colors.primaryDeep, marginTop: 2 },
  postedName: { ...typography.subtitle, color: colors.textStrong, marginTop: 2 },
  body: { ...typography.body, color: colors.textBody, marginTop: spacing.md },
  actionsCol: { gap: spacing.sm },
  secondaryAction: {},
  webLink: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11,15,25,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: spacing.md,
  },
  modalSubtitle: { marginBottom: spacing.md },
  modalField: { marginBottom: spacing.md },
  fieldLabelEn: { ...typography.label, color: colors.textBody, marginBottom: 2 },
  fieldLabelUr: {
    ...urduTypography.label,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    ...typography.body,
    color: colors.textStrong,
    backgroundColor: colors.surface,
  },
  modalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flex1: { flex: 1 },
});
