import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { fetchPhase3Flags } from '../../lib/featureFlags';
import { extractDocument } from '../../lib/ocr';
import { preprocessForOcr } from '../../lib/ocr/preprocess';
import type { OcrResult } from '../../lib/ocr/types';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type DocChoice = 'cnic' | 'license';

type FieldsState = {
  cnic_number: string;
  license_number: string;
  holder_name: string;
};

const EMPTY_FIELDS: FieldsState = {
  cnic_number: '',
  license_number: '',
  holder_name: '',
};

type BannerTone = 'info' | 'success' | 'warning' | 'danger';
type BannerState =
  | { kind: 'id'; id: StringId; tone: BannerTone }
  | { kind: 'text'; text: string; tone: BannerTone }
  | null;

export default function WorkerOnboardingScreen() {
  const { session, role } = useAuth();
  const userId = session?.user.id ?? null;
  const { t } = useT();
  const insets = useSafeAreaInsets();

  const [docChoice, setDocChoice] = useState<DocChoice>('cnic');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldsState>(EMPTY_FIELDS);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [ocrEnabled, setOcrEnabled] = useState(false);

  const bannerId = (id: StringId, tone: BannerTone = 'info') => setBanner({ kind: 'id', id, tone });
  const bannerText = (text: string, tone: BannerTone = 'warning') => setBanner({ kind: 'text', text, tone });

  useEffect(() => {
    fetchPhase3Flags()
      .then((flags) => setOcrEnabled(flags.ocrEnabled))
      .catch(() => setOcrEnabled(false));
  }, []);

  const pickImage = async () => {
    setBanner(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      bannerId('onboarding.toast.permDenied', 'warning');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setOcrResult(null);

    try {
      const processed = await preprocessForOcr({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        base64: asset.base64 ?? null,
      });
      setImageUri(processed.uri);
      setImageBase64(processed.base64);
    } catch {
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ?? null);
    }
  };

  const runOcr = async () => {
    if (!imageBase64) {
      bannerId('onboarding.toast.pickFirst', 'warning');
      return;
    }
    setBusy(true);
    setBanner(null);
    const result = await extractDocument({ doc: docChoice, base64: imageBase64 });
    setOcrResult(result);

    if (result.status === 'parsed') {
      setFields((prev) => ({
        ...prev,
        cnic_number: (result.fields.cnic_number ?? prev.cnic_number) || '',
        license_number: (result.fields.license_number ?? prev.license_number) || '',
        holder_name: (result.fields.holder_name ?? prev.holder_name) || '',
      }));
      void trackEvent('ocr_parsed', userId, {
        doc: docChoice,
        provider: result.provider,
        confidence: result.confidence,
      });
    } else if (result.status === 'manual_fallback') {
      setFields((prev) => ({
        ...prev,
        cnic_number: (result.fields.cnic_number ?? prev.cnic_number) || '',
        license_number: (result.fields.license_number ?? prev.license_number) || '',
        holder_name: (result.fields.holder_name ?? prev.holder_name) || '',
      }));
      void trackEvent('ocr_manual_fallback', userId, { doc: docChoice, reason: result.reason });
      if (result.reason === 'provider_unavailable' || result.reason === 'parse_failed') {
        void supabase.rpc('log_ocr_failure', {
          p_doc_type: docChoice,
          p_provider: 'google',
          p_note: `reason=${result.reason}`,
        });
      }
    } else {
      void trackEvent('ocr_disabled', userId, { doc: docChoice });
    }
    setBusy(false);
  };

  const save = async () => {
    if (!userId) return;
    setBusy(true);
    setBanner(null);
    const status =
      ocrResult?.status === 'parsed'
        ? 'parsed'
        : ocrResult?.status === 'manual_fallback'
          ? 'manual_fallback'
          : 'pending';
    const provider = ocrResult?.status === 'parsed' ? ocrResult.provider : 'manual';
    const confidence = ocrResult?.status === 'parsed' ? ocrResult.confidence : null;

    const parsed: Record<string, string> = {};
    if (docChoice === 'cnic' && fields.cnic_number) parsed.cnic_number = fields.cnic_number;
    if (docChoice === 'license' && fields.license_number) parsed.license_number = fields.license_number;
    if (fields.holder_name) parsed.holder_name = fields.holder_name;

    const { error } = await supabase.from('ocr_extractions').insert({
      worker_id: userId,
      doc_type: docChoice,
      provider,
      confidence,
      parsed,
      raw_text: ocrResult?.status === 'parsed' ? ocrResult.text : null,
      status,
    });

    setBusy(false);
    if (error) {
      bannerText(error.message, 'danger');
      return;
    }
    bannerId('onboarding.toast.saved', 'success');
    void trackEvent('ocr_extraction_saved', userId, {
      doc: docChoice,
      status,
      provider,
    });
  };

  if (role !== 'worker') {
    return (
      <View style={styles.center}>
        <EmptyState icon="lock" titleId="onboarding.workerOnly" />
      </View>
    );
  }

  const stepDone = (n: number) => {
    if (n === 1) return !!imageUri;
    if (n === 2) return ocrResult !== null;
    if (n === 3) return false;
    return false;
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Card padding="lg">
        <BiText id="onboarding.title" variant="title" tone="strong" style={styles.cardTitle} />
        <BiText
          id={ocrEnabled ? 'onboarding.intro.ocr' : 'onboarding.intro.manual'}
          variant="body"
          tone="muted"
          style={styles.cardSubtitle}
        />
        {!ocrEnabled && (
          <Chip label={t('onboarding.ocrDisabledChip').en} tone="warning" icon="alert-triangle" />
        )}

        <View style={styles.stepperRow}>
          <StepperPill n={1} icon="image" labelEn="Pick" labelUr="منتخب" active done={stepDone(1)} />
          <View style={styles.stepperLine} />
          <StepperPill n={2} icon="zap" labelEn="Scan" labelUr="اسکین" active={!!imageUri} done={stepDone(2)} />
          <View style={styles.stepperLine} />
          <StepperPill n={3} icon="check" labelEn="Confirm" labelUr="تصدیق" active={!!ocrResult} done={false} />
        </View>
      </Card>

      <Card padding="lg">
        <BiText id="onboarding.docType" variant="title" tone="strong" style={styles.cardTitle} />
        <View style={styles.choiceRow}>
          {(['cnic', 'license'] as DocChoice[]).map((choice) => {
            const active = docChoice === choice;
            const entry = t(choice === 'cnic' ? 'onboarding.cnic' : 'onboarding.licence');
            return (
              <Pressable
                key={choice}
                onPress={() => setDocChoice(choice)}
                accessibilityRole="button"
                style={[styles.choice, active && styles.choiceActive]}
              >
                <Icon name={choice === 'cnic' ? 'credit-card' : 'truck'} size={16} color={active ? colors.primaryInk : colors.textBody} />
                <Text style={[styles.choiceEn, active && styles.choiceEnActive]}>{entry.en}</Text>
                <Text style={[styles.choiceUr, active && styles.choiceUrActive]}>{entry.ur}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card padding="lg">
        <BiText id="onboarding.image.title" variant="title" tone="strong" style={styles.cardTitle} />
        <BiText id="onboarding.image.subtitle" variant="bodySm" tone="muted" style={styles.cardSubtitle} />

        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.preview}
            resizeMode="cover"
            accessibilityLabel="Selected document preview"
          />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Icon name="image" size={32} color={colors.textMuted} />
          </View>
        )}

        <Button
          labelId={imageUri ? 'onboarding.image.replace' : 'onboarding.image.pick'}
          onPress={pickImage}
          variant="secondary"
          iconLeft="upload"
          fullWidth
          style={styles.pickBtn}
        />
        <Button
          labelId={busy ? 'onboarding.working' : 'onboarding.runOcr'}
          onPress={runOcr}
          iconLeft="zap"
          loading={busy}
          fullWidth
        />
      </Card>

      {ocrResult && (
        <Card padding="lg">
          <BiText id="onboarding.ocrResult" variant="title" tone="strong" style={styles.cardTitle} />
          <View style={styles.chipRow}>
            {ocrResult.status === 'parsed' && (
              <>
                <Chip label={`parsed · ${ocrResult.provider}`} tone="accent" icon="check-circle" />
                <Chip label={`${Math.round(ocrResult.confidence * 100)}% confidence`} tone="primary" />
              </>
            )}
            {ocrResult.status === 'manual_fallback' && (
              <>
                <Chip label={`fallback · ${ocrResult.reason}`} tone="warning" icon="alert-triangle" />
                <Chip label={t('onboarding.editBelow').en} tone="info" />
              </>
            )}
            {ocrResult.status === 'disabled' && <Chip label="OCR disabled" tone="neutral" />}
          </View>
        </Card>
      )}

      <Card padding="lg">
        <BiText id="onboarding.confirm.title" variant="title" tone="strong" style={styles.cardTitle} />
        {docChoice === 'cnic' && (
          <Field labelEn={t('onboarding.placeholder.cnic').en} labelUr={t('onboarding.placeholder.cnic').ur}>
            <TextInput
              value={fields.cnic_number}
              onChangeText={(v) => setFields((prev) => ({ ...prev, cnic_number: v }))}
              placeholder={t('onboarding.placeholder.cnic').en}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="characters"
            />
          </Field>
        )}
        {docChoice === 'license' && (
          <Field labelEn={t('onboarding.placeholder.licence').en} labelUr={t('onboarding.placeholder.licence').ur}>
            <TextInput
              value={fields.license_number}
              onChangeText={(v) => setFields((prev) => ({ ...prev, license_number: v }))}
              placeholder={t('onboarding.placeholder.licence').en}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="characters"
            />
          </Field>
        )}
        <Field labelEn={t('onboarding.placeholder.holder').en} labelUr={t('onboarding.placeholder.holder').ur}>
          <TextInput
            value={fields.holder_name}
            onChangeText={(v) => setFields((prev) => ({ ...prev, holder_name: v }))}
            placeholder={t('onboarding.placeholder.holder').en}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </Field>
        <Button
          labelId={busy ? 'onboarding.saving' : 'onboarding.save'}
          onPress={save}
          variant="success"
          iconLeft="save"
          loading={busy}
          fullWidth
        />
      </Card>

      {banner ? (
        banner.kind === 'id' ? <Banner id={banner.id} tone={banner.tone} /> : <Banner text={banner.text} tone={banner.tone} />
      ) : null}
      {busy && <ActivityIndicator color={colors.primary} />}
    </ScrollView>
  );
}

function StepperPill({
  n,
  icon,
  labelEn,
  labelUr,
  active,
  done,
}: {
  n: number;
  icon: 'image' | 'zap' | 'check';
  labelEn: string;
  labelUr: string;
  active?: boolean;
  done?: boolean;
}) {
  const ringStyle = done ? styles.stepperRingDone : active ? styles.stepperRingActive : styles.stepperRingIdle;
  const inkColor = done || active ? colors.primaryInk : colors.textMuted;
  return (
    <View style={styles.stepper}>
      <View style={[styles.stepperCircle, ringStyle]}>
        {done ? (
          <Icon name="check" size={14} color={colors.primaryInk} />
        ) : (
          <Icon name={icon} size={14} color={inkColor} />
        )}
      </View>
      <Text style={styles.stepperEn}>{labelEn}</Text>
      <Text style={styles.stepperUr}>{labelUr}</Text>
    </View>
  );
}

function Field({
  labelEn,
  labelUr,
  children,
}: {
  labelEn: string;
  labelUr: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{labelEn}</Text>
      <Text style={styles.fieldLabelUr}>{labelUr}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.bg },
  cardTitle: { marginBottom: spacing.sm },
  cardSubtitle: { marginBottom: spacing.md },
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  stepper: { alignItems: 'center', flex: 1 },
  stepperCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepperRingIdle: { backgroundColor: colors.surfaceAlt },
  stepperRingActive: { backgroundColor: colors.primary },
  stepperRingDone: { backgroundColor: colors.accent },
  stepperEn: { ...typography.caption, color: colors.textStrong, fontWeight: '700' },
  stepperUr: { ...urduTypography.caption, color: colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  stepperLine: { width: 16, height: 2, backgroundColor: colors.divider, marginBottom: 18 },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceEn: { ...typography.label, color: colors.textStrong, marginTop: 6 },
  choiceEnActive: { color: colors.primaryInk },
  choiceUr: { ...urduTypography.caption, color: colors.textMuted, marginTop: 2 },
  choiceUrActive: { color: 'rgba(255,255,255,0.85)' },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  previewPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBtn: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  field: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, color: colors.textBody, marginBottom: 2 },
  fieldLabelUr: { ...urduTypography.label, color: colors.textMuted, textAlign: 'right', writingDirection: 'rtl', marginBottom: 4 },
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
});
