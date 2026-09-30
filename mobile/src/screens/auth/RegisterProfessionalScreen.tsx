import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCityAreaFields } from '../../components/CityAreaFields';
import { PrivacyPolicyModal } from '../../components/PrivacyPolicyModal';
import { RegistrationDoneModal } from '../../components/RegistrationDoneModal';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { ImageEditorModal } from '../../components/ui/ImageEditorModal';
import { ImageSourceSheet } from '../../components/ui/ImageSourceSheet';
import { Input } from '../../components/ui/Input';
import { formatMinutes, TimeField } from '../../components/ui/TimeField';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { en, useT } from '../../i18n/useT';
import { pickImage, type ImageSource } from '../../lib/pickImage';
import { useSkillCategories } from '../../lib/skillCategories';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { saveWorkerLocation, stashPendingUploads, uploadWorkerFiles } from '../../lib/workerUploads';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type RateUnit = 'day' | 'hour';
type ImageTarget = 'photo' | 'cnicFront' | 'cnicBack';
type Step = 'creating' | 'uploading' | 'finishing';

const STEP_LABEL: Record<Step, StringId> = {
  creating: 'register.step.creating',
  uploading: 'register.step.uploading',
  finishing: 'register.step.finishing',
};

/** A rejected Ustad's saved application, used to pre-fill the form when they apply again. */
export type ReapplyData = {
  userId: string;
  displayName: string;
  phone: string;
  city: string | null;
  area: string | null;
  address: string | null;
  cnic: string;
  skillCategory: string | null;
  yearsExperience: number | null;
  ratePkr: number | null;
  rateUnit: RateUnit | null;
  workingHours: string | null;
  bio: string;
  photoUrl: string | null;
  cnicFrontUrl: string | null;
  cnicBackUrl: string | null;
  lat: number | null;
  lng: number | null;
};

function parseTime(text: string): number | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
}

function parseHours(text: string | null): { from: number; to: number } {
  const parts = (text ?? '').split(/[–-]/);
  const from = parseTime(parts[0] ?? '');
  const to = parseTime(parts[1] ?? '');
  return from !== null && to !== null ? { from, to } : { from: 9 * 60, to: 18 * 60 };
}

export default function RegisterProfessionalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ProfessionalRegistrationForm
      onRegistered={() => navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Auth' }] })}
    />
  );
}

type FormProps = {
  /** Called when the "application received" popup is closed (new sign-ups only). */
  onRegistered?: () => void;
  /** Present when a rejected Ustad is correcting their saved application. */
  reapply?: { data: ReapplyData; onSubmitted: () => void };
};

export function ProfessionalRegistrationForm({ onRegistered, reapply }: FormProps) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { setRegistering, signOut } = useAuth();
  const categories = useSkillCategories();
  const init = reapply?.data;
  const initHours = parseHours(init?.workingHours ?? null);
  const place = useCityAreaFields(
    init
      ? {
          cityName: init.city,
          areaName: init.area,
          addressDetails: init.address,
          location: init.lat !== null && init.lng !== null ? { lat: init.lat, lng: init.lng } : null,
        }
      : undefined
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(init?.displayName ?? '');
  const [mobile, setMobile] = useState(init?.phone ?? '');
  const [cnic, setCnic] = useState(init?.cnic ?? '');
  const [skillKey, setSkillKey] = useState<string | null>(init?.skillCategory ?? null);
  const [experience, setExperience] = useState(init?.yearsExperience != null ? String(init.yearsExperience) : '');
  const [rate, setRate] = useState(init?.ratePkr != null ? String(init.ratePkr) : '');
  const [rateUnit, setRateUnit] = useState<RateUnit>(init?.rateUnit ?? 'day');
  const [fromMin, setFromMin] = useState(initHours.from);
  const [toMin, setToMin] = useState(initHours.to);
  const [bio, setBio] = useState(init?.bio ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(init?.photoUrl ?? null);
  const [cnicFrontUri, setCnicFrontUri] = useState<string | null>(init?.cnicFrontUrl ?? null);
  const [cnicBackUri, setCnicBackUri] = useState<string | null>(init?.cnicBackUrl ?? null);
  const [sheetTarget, setSheetTarget] = useState<ImageTarget | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(!!reapply);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uploadWarning, setUploadWarning] = useState(false);
  const [editing, setEditing] = useState<{ target: ImageTarget; uri: string } | null>(null);

  const hoursValid = toMin > fromMin;

  const missing: StringId[] = [];
  if (!reapply && !email.trim()) missing.push('register.missing.email');
  if (!reapply && !password) missing.push('register.missing.password');
  if (!fullName.trim()) missing.push('register.missing.name');
  if (!mobile.trim()) missing.push('register.missing.mobile');
  if (!cnic.trim()) missing.push('register.missing.cnic');
  if (!cnicFrontUri) missing.push('register.missing.cnicFront');
  if (!cnicBackUri) missing.push('register.missing.cnicBack');
  if (!place.cityName) missing.push('register.missing.city');
  if (!place.areaName) missing.push('register.missing.area');
  if (!skillKey) missing.push('register.missing.skill');
  if (!experience.trim()) missing.push('register.missing.experience');
  if (!rate.trim()) missing.push('register.missing.rate');
  if (!hoursValid) missing.push('register.missing.hours');
  if (!photoUri) missing.push('register.missing.photo');
  if (!bio.trim()) missing.push('register.missing.bio');
  if (!privacyAccepted) missing.push('register.missing.privacy');
  const canSubmit = missing.length === 0;

  const onPickSource = async (source: ImageSource) => {
    const target = sheetTarget;
    setSheetTarget(null);
    if (!target) return;
    const result = await pickImage(source);
    if (result.status === 'denied') {
      setError(en('image.permissionDenied'));
      return;
    }
    if (result.status !== 'ok') return;
    setError(null);
    setEditing({ target, uri: result.uri });
  };

  const onEdited = (uri: string) => {
    const target = editing?.target;
    setEditing(null);
    if (target === 'photo') setPhotoUri(uri);
    else if (target === 'cnicFront') setCnicFrontUri(uri);
    else if (target === 'cnicBack') setCnicBackUri(uri);
  };

  const closeDone = () => {
    setDone(false);
    onRegistered?.();
  };

  const submitReapply = async () => {
    if (!reapply) return;
    if (!canSubmit) {
      setError(en(hoursValid ? 'register.error.required' : 'register.professional.hoursError'));
      return;
    }
    const { data } = reapply;
    setBusy(true);
    setError(null);
    try {
      // Only images the Ustad replaced (a new local file rather than the saved link) are uploaded.
      const replaced = (uri: string | null, saved: string | null) => (uri && uri !== saved ? uri : null);
      const uploaded = await uploadWorkerFiles(data.userId, {
        photo: replaced(photoUri, data.photoUrl),
        cnicFront: replaced(cnicFrontUri, data.cnicFrontUrl),
        cnicBack: replaced(cnicBackUri, data.cnicBackUrl),
      });
      if (!uploaded) throw new Error(en('approval.reapply.failed'));
      const { error: rpcError } = await supabase.rpc('worker_resubmit_application', {
        p_display_name: fullName.trim(),
        p_phone: mobile.trim(),
        p_city: place.cityName,
        p_area: place.areaName,
        p_address: place.addressDetails || null,
        p_cnic: cnic.trim(),
        p_skill_category: skillKey,
        p_years_experience: Number(experience.trim()),
        p_rate_pkr: Number(rate.trim()),
        p_rate_unit: rateUnit,
        p_working_hours: `${formatMinutes(fromMin)} – ${formatMinutes(toMin)}`,
        p_bio: bio.trim(),
      });
      if (rpcError) throw rpcError;
      if (place.location) await saveWorkerLocation(data.userId, place.location.lat, place.location.lng);
      reapply.onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : en('approval.reapply.failed'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (reapply) return submitReapply();
    if (!privacyAccepted) {
      setError(en('register.error.privacy'));
      return;
    }
    if (!canSubmit) {
      setError(en(hoursValid ? 'register.error.required' : 'register.professional.hoursError'));
      return;
    }
    setBusy(true);
    setError(null);
    setUploadWarning(false);
    setStep('creating');
    // Keeps the approval lock from covering this screen while the account is created and files are uploaded.
    setRegistering(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'worker',
            display_name: fullName.trim(),
            phone: mobile.trim(),
            city: place.cityName,
            area: place.areaName,
            address: place.addressDetails || null,
            cnic_number: cnic.trim(),
            skill_category: skillKey,
            years_experience: experience.trim(),
            rate_pkr: rate.trim(),
            rate_unit: rateUnit,
            working_hours: `${formatMinutes(fromMin)} – ${formatMinutes(toMin)}`,
            bio: bio.trim(),
          },
        },
      });
      if (signUpError) throw signUpError;

      let userId = data.user?.id ?? null;
      if (!data.session) {
        // Email confirmation is off, so a session normally arrives with sign-up; this is a safety net.
        const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        userId = signedIn.user?.id ?? userId;
      }

      if (userId) {
        setStep('uploading');
        const files = { photo: photoUri, cnicFront: cnicFrontUri, cnicBack: cnicBackUri };
        const uploaded = await uploadWorkerFiles(userId, files);
        if (place.location) await saveWorkerLocation(userId, place.location.lat, place.location.lng);
        if (!uploaded) {
          await stashPendingUploads(email, files);
          setUploadWarning(true);
        }
      }

      setStep('finishing');
      try {
        await signOut();
      } catch {
        // the session is cleared locally either way
      }
      setPassword('');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : en('auth.error.failed'));
    } finally {
      setRegistering(false);
      setBusy(false);
      setStep(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <BiText id={reapply ? 'approval.reapply.title' : 'register.professional.title'} variant="title" tone="strong" style={styles.title} />
        <BiText id={reapply ? 'approval.reapply.hint' : 'register.professional.subtitle'} variant="bodySm" tone="muted" style={styles.subtitle} />

        <Card padding="lg">
          {!reapply ? (
            <>
          <BiText id="register.accountSection" variant="label" tone="muted" style={styles.sectionLabel} />
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderId="common.email"
            labelId="common.email"
            iconLeft="mail"
            textContentType="emailAddress"
          />
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderId="common.password"
            labelId="common.password"
            iconLeft="lock"
            textContentType="newPassword"
          />
            </>
          ) : null}

          <Input
            value={fullName}
            onChangeText={setFullName}
            labelId="register.professional.fullName"
            placeholderId="register.professional.fullNamePh"
            iconLeft="user"
          />
          <Input
            value={mobile}
            onChangeText={setMobile}
            labelId="register.professional.mobile"
            placeholderId="register.professional.mobilePh"
            iconLeft="phone"
            keyboardType="phone-pad"
          />
          <Input
            value={cnic}
            onChangeText={setCnic}
            labelId="register.professional.cnic"
            placeholderId="register.professional.cnicPh"
            iconLeft="credit-card"
          />
          <View style={styles.cnicRow}>
            <CnicUploadBox
              labelId="register.professional.cnicFront"
              uri={cnicFrontUri}
              onPress={() => setSheetTarget('cnicFront')}
            />
            <CnicUploadBox
              labelId="register.professional.cnicBack"
              uri={cnicBackUri}
              onPress={() => setSheetTarget('cnicBack')}
            />
          </View>

          {place.fields}

          <BiText id="register.professional.skillCategory" variant="label" tone="muted" style={styles.sectionLabel} />
          <View style={styles.skillGrid}>
            {categories.map((cat) => {
              const active = skillKey === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setSkillKey(cat.key)}
                  accessibilityRole="button"
                  style={[styles.skillChip, active && styles.skillChipActive]}
                >
                  <Image source={cat.icon} style={styles.skillChipIcon} resizeMode="contain" />
                  <Text style={[typography.label, styles.skillChipEn, active && styles.skillChipEnActive]}>{cat.en}</Text>
                </Pressable>
              );
            })}
          </View>

          <Input
            value={experience}
            onChangeText={setExperience}
            labelId="register.professional.experience"
            placeholderId="register.professional.experiencePh"
            iconLeft="clock"
            keyboardType="number-pad"
          />

          <BiText id="register.professional.rate" variant="label" tone="muted" style={styles.sectionLabel} />
          <View style={styles.rateRow}>
            <Input
              value={rate}
              onChangeText={setRate}
              placeholderId="register.professional.ratePh"
              iconLeft="dollar-sign"
              keyboardType="number-pad"
              containerStyle={styles.rateInput}
            />
          </View>
          <View style={styles.rateUnitRow}>
            <RateUnitPill labelId="register.professional.rateUnitDay" active={rateUnit === 'day'} onPress={() => setRateUnit('day')} />
            <RateUnitPill labelId="register.professional.rateUnitHour" active={rateUnit === 'hour'} onPress={() => setRateUnit('hour')} />
          </View>

          <BiText id="register.professional.workingHours" variant="label" tone="muted" style={styles.sectionLabel} />
          <View style={styles.hoursRow}>
            <TimeField label={t('register.professional.hoursFrom').en} value={fromMin} onChange={setFromMin} />
            <TimeField label={t('register.professional.hoursTo').en} value={toMin} onChange={setToMin} />
          </View>
          {!hoursValid ? <Text style={styles.hoursError}>{t('register.professional.hoursError').en}</Text> : null}

          <BiText id="register.professional.photo" variant="label" tone="muted" style={styles.sectionLabel} />
          <Pressable onPress={() => setSheetTarget('photo')} accessibilityRole="button" style={styles.photoBox}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <>
                <Icon name="camera" size={22} color={colors.primary} />
                <Text style={[typography.label, styles.photoUploadText]}>{t('register.professional.photoUpload').en}</Text>
                <Text style={[typography.caption, styles.photoHintText]}>{t('register.professional.photoHint').en}</Text>
              </>
            )}
          </Pressable>

          <Input
            value={bio}
            onChangeText={setBio}
            labelId="register.professional.bio"
            placeholderId="register.professional.bioPh"
            iconLeft="file-text"
            multiline
            numberOfLines={4}
            style={styles.bioInput}
          />

          {!reapply ? (
          <Pressable
            onPress={() => (privacyAccepted ? setPrivacyAccepted(false) : setPrivacyOpen(true))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: privacyAccepted }}
            style={styles.privacyRow}
          >
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxOn]}>
              {privacyAccepted ? <Icon name="check" size={14} color={colors.primaryInk} /> : null}
            </View>
            <Text style={[typography.bodySm, styles.privacyText]}>{t('privacy.checkbox').en}</Text>
          </Pressable>
          ) : null}

          {!!error && (
            <View style={styles.errorBox}>
              <Icon name="alert-triangle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {busy && step ? <Text style={styles.stepText}>{t(STEP_LABEL[step]).en}</Text> : null}
          {!canSubmit && !busy ? (
            <View style={styles.missingBox}>
              <Icon name="info" size={16} color={colors.textMuted} />
              <View style={{ flex: 1, marginLeft: spacing.xs }}>
                <Text style={styles.missingText}>
                  {t('register.missing').en} {missing.map((id) => t(id).en).join(', ')}
                </Text>
                <Text style={[styles.missingText, styles.missingUrdu]}>
                  {t('register.missing').ur} {missing.map((id) => t(id).ur).join('، ')}
                </Text>
              </View>
            </View>
          ) : null}
          <Button
            labelId={busy ? 'register.professional.submitting' : reapply ? 'approval.reapply.submit' : 'register.professional.submit'}
            onPress={submit}
            loading={busy}
            disabled={busy || !canSubmit}
            variant="success"
            size="lg"
            fullWidth
            iconRight="arrow-right"
            style={styles.submitBtn}
          />
        </Card>

        <BiText id="register.termsNotice" variant="caption" tone="muted" align="center" style={styles.termsNotice} />
      </ScrollView>

      <ImageSourceSheet visible={sheetTarget !== null} onPick={onPickSource} onClose={() => setSheetTarget(null)} />
      <ImageEditorModal
        visible={editing !== null}
        uri={editing?.uri ?? null}
        aspect={editing?.target === 'photo' ? 3 / 4 : 1.586}
        onDone={onEdited}
        onCancel={() => setEditing(null)}
      />
      <RegistrationDoneModal visible={done} uploadWarning={uploadWarning} onClose={closeDone} />
      <PrivacyPolicyModal
        visible={privacyOpen}
        onAgree={() => {
          setPrivacyAccepted(true);
          setPrivacyOpen(false);
        }}
        onClose={() => setPrivacyOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function CnicUploadBox({
  labelId,
  uri,
  onPress,
}: {
  labelId: StringId;
  uri: string | null;
  onPress: () => void;
}) {
  const { t } = useT();
  return (
    <View style={styles.cnicCol}>
      <Text style={[typography.label, styles.cnicLabel]}>{t(labelId).en}</Text>
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.cnicBox}>
        {uri ? (
          <Image source={{ uri }} style={styles.cnicPreview} resizeMode="cover" />
        ) : (
          <>
            <Icon name="credit-card" size={20} color={colors.primary} />
            <Text style={[typography.caption, styles.cnicUploadText]}>{t('register.professional.cnicUpload').en}</Text>
          </>
        )}
      </Pressable>
      <Text style={[typography.caption, styles.cnicHintText]}>{t('register.professional.cnicHint').en}</Text>
    </View>
  );
}

function RateUnitPill({ labelId, active, onPress }: { labelId: StringId; active: boolean; onPress: () => void }) {
  const { t } = useT();
  const label = t(labelId);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.unitPill, active && styles.unitPillActive]}>
      <Text style={[typography.label, active && styles.unitPillLabelActive]}>{label.en}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, flexGrow: 1 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.lg },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs },
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  skillChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillChipIcon: { width: 16, height: 16 },
  skillChipEn: { color: colors.textStrong },
  skillChipEnActive: { color: colors.primaryInk },
  rateRow: { flexDirection: 'row' },
  rateInput: { flex: 1 },
  rateUnitRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  unitPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitPillLabelActive: { color: colors.primaryInk },
  hoursRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  hoursError: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  photoBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  // Portrait (3:4) so a face photo isn't squashed into a wide strip.
  photoPreview: { width: 150, aspectRatio: 3 / 4, alignSelf: 'center', marginVertical: spacing.sm, borderRadius: radius.sm },
  photoUploadText: { color: colors.primaryDeep, marginTop: 6 },
  photoHintText: { color: colors.textMuted, marginTop: 2 },
  cnicRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  cnicCol: { flex: 1 },
  cnicLabel: { color: colors.textMuted, marginBottom: 4 },
  cnicBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  // Landscape, ID-1 card ratio (85.6 x 54 mm).
  cnicPreview: { width: '100%', aspectRatio: 1.586 },
  cnicUploadText: { color: colors.primaryDeep, marginTop: 4, textAlign: 'center' },
  cnicHintText: { color: colors.textMuted, marginTop: 2 },
  bioInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  privacyText: { flex: 1, color: colors.textBody },
  stepText: { ...typography.bodySm, color: colors.textMuted, marginBottom: spacing.xs, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  errorText: { ...typography.bodySm, color: colors.danger, marginLeft: spacing.xs, flex: 1 },
  missingBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  missingText: { ...typography.caption, color: colors.textMuted },
  missingUrdu: { textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  submitBtn: { marginTop: spacing.sm },
  termsNotice: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
});
