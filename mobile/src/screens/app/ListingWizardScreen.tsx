import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AiHelpButton } from '../../components/ai/AiHelpButton';
import { AreaPicker } from '../../components/AreaPicker';
import { BilingualReview, type ReviewField } from '../../components/ai/BilingualReview';
import { PhotoAttach } from '../../components/PhotoAttach';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { WizardShell } from '../../components/wizard/WizardShell';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/useT';
import { AI_ERROR_STRING, fetchAiHelpEnabled } from '../../lib/aiDraft';
import { trackEvent } from '../../lib/analytics';
import { templateCategoryFor } from '../../lib/categoryMap';
import type { I18n } from '../../lib/i18nText';
import {
  loadOwnListingPhotos,
  parseAreas,
  removeListingPhoto,
  uploadListingPhotos,
  validateListing,
  type ListingErrors,
  type OwnPhoto,
} from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { useBilingual } from '../../lib/useBilingual';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ListingWizard'>;

type Template = { id: string; title: string; category: string };

const LISTING_FIELDS = ['headline', 'about'];
const REVIEW_FIELDS: ReviewField[] = [
  { key: 'headline', labelId: 'listing.field.headline' },
  { key: 'about', labelId: 'listing.field.about', multiline: true },
];

type ListingRow = {
  id: string;
  template_id: string;
  headline: string;
  detail_text: string | null;
  service_areas: unknown;
  status: string;
  headline_i18n: I18n;
  detail_i18n: I18n;
};

/** A saved version pair is usable when both languages have text. */
const both = (i: I18n) => !!i?.en?.trim() && !!i?.ur?.trim();

/**
 * Publish a service in three steps (your work and photos, details, review), or edit one you already published.
 * No price: Ustads quote each request. The review keeps an English and an Urdu version.
 */
export default function ListingWizardScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'ListingWizard'>>();
  const { session, role, workerApprovalStatus } = useAuth();
  const uid = session?.user.id;
  const { t } = useT();
  const editId = route.params?.listingId;
  const isEdit = !!editId;

  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [lockedTitle, setLockedTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [areas, setAreas] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [existing, setExisting] = useState<OwnPhoto[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);
  const [errors, setErrors] = useState<ListingErrors>({});
  const [fillError, setFillError] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [photosFailed, setPhotosFailed] = useState(false);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [profileCity, setProfileCity] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const bi = useBilingual('listing', LISTING_FIELDS);
  const draft = route.params?.draft;
  const prefill = route.params?.prefill;

  useEffect(() => {
    fetchAiHelpEnabled().then(setAiEnabled);
  }, []);

  useEffect(() => {
    if (isEdit) navigation.setOptions?.({ title: t('nav.listingEdit').en });
  }, [isEdit, navigation, t]);

  // A draft from "Help me write": fill the text, keep both languages, and land on Details for the areas.
  useEffect(() => {
    if (!draft) return;
    bi.applyDraft(
      draft.source,
      { headline: draft.headline.en, about: draft.about.en },
      { headline: draft.headline.ur, about: draft.about.ur },
    );
    setHeadline(draft.headline[draft.source]);
    setAbout(draft.about[draft.source]);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // The helper could not write a draft: keep what the Ustad typed and let them finish it by hand.
  useEffect(() => {
    if (!prefill?.about) return;
    setAbout((cur) => cur || prefill.about);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Editing the original text keeps the prepared versions but marks the other language out of date.
  const editOriginal = (key: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (bi.versions) bi.edit(bi.source, key, v);
  };

  // Editing: load the saved listing, its photos and any translations it already has.
  useEffect(() => {
    if (!editId || !uid) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('worker_service_listings')
        .select('id,template_id,headline,detail_text,service_areas,status,headline_i18n,detail_i18n')
        .eq('id', editId)
        .eq('worker_id', uid)
        .maybeSingle();
      const row = data as ListingRow | null;
      if (cancelled) return;
      if (!row) {
        setServerError('This service was not found.');
        return;
      }
      setTemplateId(row.template_id);
      setHeadline(row.headline);
      setAbout(row.detail_text ?? '');
      setAreas(Array.isArray(row.service_areas) ? row.service_areas.filter((a) => typeof a === 'string').join(', ') : '');
      setVisible(row.status === 'active');
      if (both(row.headline_i18n) && both(row.detail_i18n)) {
        const src = row.headline_i18n?.source === 'ur' ? 'ur' : 'en';
        bi.applyVersions(
          src,
          { headline: row.headline_i18n!.en!, about: row.detail_i18n!.en! },
          { headline: row.headline_i18n!.ur!, about: row.detail_i18n!.ur! },
          !!row.headline_i18n?.ai,
        );
      }
      const { data: tpl } = await supabase.from('service_templates').select('title').eq('id', row.template_id).maybeSingle();
      if (!cancelled) setLockedTitle((tpl as { title?: string } | null)?.title ?? '');
      const own = await loadOwnListingPhotos(editId);
      if (!cancelled) setExisting(own);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, uid]);

  // The Ustad's own city pre-selects the city in the area picker.
  useEffect(() => {
    if (!uid) return;
    void (async () => {
      const { data } = await supabase.from('profiles').select('city').eq('id', uid).maybeSingle();
      setProfileCity(((data as { city?: string | null } | null)?.city ?? null) || null);
    })();
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: tpl } = await supabase.from('service_templates').select('id,title,category').eq('active', true).limit(50);
      let rows = (tpl ?? []) as Template[];
      // Only offer services in the worker's own trades, when we can tell what they are.
      if (uid) {
        const { data: wp } = await supabase.from('worker_profiles').select('categories').eq('user_id', uid).maybeSingle();
        const keys = ((wp as { categories?: string[] | null } | null)?.categories ?? []).filter(Boolean);
        const allowed = new Set(keys.map((k) => templateCategoryFor(k)).filter((c): c is string => !!c));
        if (allowed.size > 0) rows = rows.filter((r) => allowed.has(r.category));
      }
      if (!cancelled) {
        setTemplates(rows);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const isApprovedWorker = !!uid && role === 'worker' && workerApprovalStatus === 'approved';
  const template = templates.find((x) => x.id === templateId);
  const serviceTitle = template?.title ?? lockedTitle;
  const keptExisting = existing.filter((p) => !removed.includes(p.id));

  const check = () => validateListing({ templateId, headline, about, areas });

  const next = () => {
    const result = check();
    const e = result.ok ? {} : result.errors;
    if (step === 1) {
      setErrors({ templateId: e.templateId });
      if (!e.templateId) setStep(2);
      return;
    }
    if (step === 2) {
      setErrors({ headline: e.headline, about: e.about, contact: e.contact });
      if (!e.headline && !e.about && !e.contact) {
        setStep(3);
        if (!bi.versions) void bi.prepare({ headline: headline.trim(), about: about.trim() });
      }
    }
  };

  const publish = async () => {
    setServerError(null);
    setFillError(false);
    if (published) {
      navigation.replace('Tabs', { screen: 'Services' });
      return;
    }
    const result = validateListing({
      templateId,
      headline: bi.original('headline') ?? headline,
      about: bi.original('about') ?? about,
      areas,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setStep(result.errors.templateId ? 1 : 2);
      return;
    }
    if (bi.hasContact()) {
      setErrors({ contact: t('ai.error.contact').en });
      return;
    }
    if (bi.incomplete()) {
      setFillError(true);
      return;
    }
    setErrors({});
    setBusy(true);
    const v = result.value;
    const fields = {
      headline: v.headline,
      detail_text: v.about,
      service_areas: v.areas,
      headline_i18n: bi.toI18n('headline'),
      detail_i18n: bi.toI18n('about'),
    };

    let listingId = editId ?? '';
    if (isEdit) {
      const { error } = await supabase
        .from('worker_service_listings')
        .update({ ...fields, status: visible ? 'active' : 'paused' })
        .eq('id', editId);
      if (error) {
        setBusy(false);
        setServerError(error.message);
        return;
      }
      void trackEvent('listing_updated', uid!, { listing_id: editId, photos_added: photos.length, photos_removed: removed.length });
    } else {
      const { data, error } = await supabase
        .from('worker_service_listings')
        .insert({ worker_id: uid!, template_id: v.templateId, ...fields, status: 'active' })
        .select('id')
        .single();
      if (error || !data) {
        setBusy(false);
        setServerError(error?.message ?? 'Could not publish the listing.');
        return;
      }
      listingId = (data as { id: string }).id;
      void trackEvent('listing_published', uid!, { template_id: v.templateId, photos: photos.length, areas: v.areas.length });
    }

    let failed = 0;
    for (const id of removed) {
      try {
        await removeListingPhoto(id);
      } catch {
        failed += 1;
      }
    }
    if (photos.length > 0) failed += (await uploadListingPhotos(uid!, listingId, photos)).failed;
    setBusy(false);
    if (failed > 0) {
      setPhotosFailed(true);
      setPublished(true);
      return;
    }
    navigation.replace('Tabs', { screen: 'Services' });
  };

  const gate = !uid
    ? 'services.gate.publishSignIn'
    : role !== 'worker'
      ? 'services.gate.publishRole'
      : workerApprovalStatus !== 'approved'
        ? 'services.approval.pendingBanner'
        : null;

  const areaList = parseAreas(areas);

  return (
    <WizardShell
      step={step}
      total={3}
      stepNameId={step === 1 ? 'listing.step.work' : step === 2 ? 'post.step.details' : 'post.step.review'}
      onBack={step > 1 && !published ? () => setStep(step - 1) : undefined}
      onNext={step === 3 ? publish : next}
      nextLabelId={step === 3 ? (published ? 'common.done' : isEdit ? 'listing.saveChanges' : 'services.publish.cta') : 'wizard.next'}
      nextIcon={step === 3 ? 'check' : 'arrow-right'}
      busy={busy}
      nextDisabled={step === 3 && !published && (!isApprovedWorker || bi.busy || (!!bi.versions && !bi.checked))}
      top={
        <>
          {gate ? <Banner id={gate} tone="warning" /> : null}
          {serverError ? <Banner text={serverError} tone="warning" /> : null}
          {photosFailed ? <Banner id="listing.photosFailed" tone="warning" /> : null}
          {errors.contact ? <Banner text={errors.contact} tone="warning" /> : null}
          {fillError ? <Banner id="review.fillBoth" tone="warning" /> : null}
        </>
      }
    >
      {step === 1 && (
        <>
          {aiEnabled && isApprovedWorker && !isEdit ? (
            <AiHelpButton
              subId="ai.helpMe.listing"
              onPress={() => {
                if (!template) {
                  setErrors({ templateId: 'Choose the service you offer.' });
                  return;
                }
                navigation.navigate('AiHelper', { mode: 'listing', serviceTitle: template.title });
              }}
            />
          ) : null}
          <Card padding="lg">
            <BiText id="listing.field.service" variant="label" tone="body" style={styles.label} />
            {isEdit ? (
              <>
                <View style={styles.pills}>
                  <Chip label={serviceTitle || '…'} tone="primary" icon="tag" />
                </View>
                <BiText id="listing.serviceLocked" variant="caption" tone="muted" style={styles.lockedHint} />
              </>
            ) : (
              <>
                {loaded && templates.length === 0 ? <BiText id="listing.noTemplates" variant="bodySm" tone="muted" /> : null}
                <View style={styles.pills}>
                  {templates.map((x) => (
                    <Pressable
                      key={x.id}
                      onPress={() => setTemplateId(x.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: templateId === x.id }}
                      style={[styles.pill, templateId === x.id && styles.pillOn]}
                    >
                      <Text style={[typography.label, templateId === x.id ? styles.pillTextOn : styles.pillText]}>{x.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            {errors.templateId ? <Text style={styles.err}>{errors.templateId}</Text> : null}
          </Card>
          <Card padding="lg">
            <BiText id="listing.photos.hint" variant="bodySm" tone="muted" style={styles.label} />
            {keptExisting.length > 0 ? (
              <>
                <BiText id="listing.currentPhotos" variant="label" tone="body" style={styles.label} />
                <View style={styles.existingRow}>
                  {keptExisting.map((p) => (
                    <View key={p.id} style={styles.thumbWrap}>
                      <Image source={{ uri: p.url }} style={styles.thumb} accessibilityIgnoresInvertColors />
                      <Pressable
                        onPress={() => setRemoved((r) => [...r, p.id])}
                        accessibilityRole="button"
                        accessibilityLabel={t('media.remove').en}
                        style={styles.remove}
                        hitSlop={8}
                      >
                        <Icon name="x" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            <PhotoAttach uris={photos} onChange={setPhotos} alreadyAttached={keptExisting.length} hideHint />
            {photos.length + keptExisting.length < 3 ? <BiText id="listing.photoTip" variant="caption" tone="muted" /> : null}
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <Card padding="lg">
            <Input
              labelId="listing.field.headline"
              value={headline}
              onChangeText={editOriginal('headline', setHeadline)}
              iconLeft="edit-3"
              error={errors.headline}
            />
            <Input
              labelId="listing.field.about"
              value={about}
              onChangeText={editOriginal('about', setAbout)}
              multiline
              numberOfLines={4}
              style={styles.multiline}
              error={errors.about}
            />
            <AreaPicker value={areaList} onChange={(list) => setAreas(list.join(', '))} defaultCity={profileCity} />
          </Card>
          {isEdit ? (
            <Card padding="lg">
              <View style={styles.visibleRow}>
                <View style={styles.visibleText}>
                  <BiText id="listing.visible" variant="label" tone="strong" />
                  <BiText id="listing.visible.hint" variant="caption" tone="muted" />
                </View>
                <Switch value={visible} onValueChange={setVisible} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
            </Card>
          ) : null}
          <Banner id="listing.noPrice" tone="info" icon="tag" />
        </>
      )}

      {step === 3 && (
        <>
          <BiText id="listing.review.hint" variant="bodySm" tone="muted" />
          {bi.busy && !bi.versions ? <Banner id="review.translating" tone="info" icon="globe" /> : null}
          {bi.error && !bi.versions ? (
            <>
              <Banner id={AI_ERROR_STRING[bi.error]} tone="warning" />
              <Banner id="review.singleLanguage" tone="info" icon="globe" />
            </>
          ) : null}
          {bi.versions ? (
            <>
              <BilingualReview
                fields={REVIEW_FIELDS}
                values={bi.versions}
                ai={bi.ai}
                stale={bi.stale}
                onChange={bi.edit}
                onUpdate={bi.update}
                updating={bi.busy}
                checked={bi.checked}
                onToggleChecked={() => bi.setChecked(!bi.checked)}
              />
              <Button labelId="review.oneLanguage" onPress={bi.reset} variant="ghost" hideUrdu />
            </>
          ) : (
            <>
              <Card padding="lg">
                <Text style={styles.reviewTitle}>{headline.trim()}</Text>
                <Text style={styles.reviewBody}>{about.trim()}</Text>
              </Card>
              {!bi.busy ? (
                <Button
                  labelId="review.addManual"
                  onPress={() => bi.startManual({ headline: headline.trim(), about: about.trim() })}
                  variant="secondary"
                  iconLeft="globe"
                  hideUrdu
                />
              ) : null}
            </>
          )}
          <Card padding="lg">
            {keptExisting.length + photos.length > 0 ? (
              <View style={styles.photoRow}>
                {keptExisting.map((p) => (
                  <Image key={p.id} source={{ uri: p.url }} style={styles.photo} accessibilityIgnoresInvertColors />
                ))}
                {photos.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors />
                ))}
              </View>
            ) : null}
            <View style={styles.chips}>
              {serviceTitle ? <Chip label={serviceTitle} tone="primary" icon="tag" /> : null}
              {areaList.map((a) => (
                <Chip key={a} label={a} icon="map-pin" />
              ))}
              {isEdit ? <Chip label={t(visible ? 'listing.status.active' : 'listing.status.paused').en} tone={visible ? 'accent' : 'warning'} /> : null}
            </View>
          </Card>
          <Banner id="listing.noPrice" tone="info" icon="tag" />
        </>
      )}
    </WizardShell>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  lockedHint: { marginTop: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textBody },
  pillTextOn: { color: colors.primaryInk },
  err: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  existingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  visibleText: { flex: 1, gap: 2 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  photo: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: spacing.sm },
  reviewTitle: { ...typography.title, color: colors.textStrong },
  reviewBody: { ...typography.body, color: colors.textBody },
});
