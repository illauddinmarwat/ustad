import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import type { StringId } from '../../i18n/strings';
import { en, useT } from '../../i18n/useT';
import { preprocessForOcr } from '../../lib/ocr/preprocess';
import { SKILL_CATEGORIES } from '../../lib/skillCategories';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type RateUnit = 'day' | 'hour';

export default function RegisterProfessionalScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [cnic, setCnic] = useState('');
  const [city, setCity] = useState('');
  const [skillKey, setSkillKey] = useState<string | null>(null);
  const [experience, setExperience] = useState('');
  const [rate, setRate] = useState('');
  const [rateUnit, setRateUnit] = useState<RateUnit>('day');
  const [workingHours, setWorkingHours] = useState('');
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cnicFrontUri, setCnicFrontUri] = useState<string | null>(null);
  const [cnicBackUri, setCnicBackUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'checkEmail' | 'pendingApproval' | null>(null);

  const canSubmit = !!(
    email.trim() &&
    password &&
    fullName.trim() &&
    mobile.trim() &&
    cnic.trim() &&
    city.trim() &&
    skillKey &&
    experience.trim() &&
    rate.trim() &&
    workingHours.trim() &&
    photoUri &&
    cnicFrontUri &&
    cnicBackUri &&
    bio.trim()
  );

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    setPhotoUri(result.assets[0].uri);
  };

  const pickCnicImage = async (side: 'front' | 'back') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    let compressedUri = asset.uri;
    try {
      const compressed = await preprocessForOcr({ uri: asset.uri, width: asset.width, height: asset.height });
      compressedUri = compressed.uri;
    } catch {
      // fall back to the original pick if compression fails
    }
    if (side === 'front') setCnicFrontUri(compressedUri);
    else setCnicBackUri(compressedUri);
  };

  const uploadImage = async (userId: string, bucket: string, path: string, uri: string): Promise<string | null> => {
    try {
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(`${userId}/${path}.${ext}`, blob, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
      if (uploadError) return null;
      return `${userId}/${path}.${ext}`;
    } catch {
      return null;
    }
  };

  const uploadPhoto = async (userId: string): Promise<string | null> => {
    if (!photoUri) return null;
    const path = await uploadImage(userId, 'worker-photos', 'profile', photoUri);
    if (!path) return null;
    return supabase.storage.from('worker-photos').getPublicUrl(path).data.publicUrl;
  };

  const submit = async () => {
    if (!canSubmit) {
      setError(en('register.error.required'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'worker',
            display_name: fullName.trim(),
            phone: mobile.trim(),
            city: city.trim(),
            cnic_number: cnic.trim(),
            skill_category: skillKey,
            years_experience: experience.trim(),
            rate_pkr: rate.trim(),
            rate_unit: rateUnit,
            working_hours: workingHours.trim(),
            bio: bio.trim(),
          },
        },
      });
      if (signUpError) throw signUpError;

      if (data.session && data.user) {
        const photoUrl = await uploadPhoto(data.user.id);
        const cnicFrontPath = cnicFrontUri ? await uploadImage(data.user.id, 'worker-documents', 'cnic-front', cnicFrontUri) : null;
        const cnicBackPath = cnicBackUri ? await uploadImage(data.user.id, 'worker-documents', 'cnic-back', cnicBackUri) : null;
        const profileUpdate: Record<string, string> = {};
        if (photoUrl) profileUpdate.photo_url = photoUrl;
        if (cnicFrontPath) profileUpdate.cnic_front_url = cnicFrontPath;
        if (cnicBackPath) profileUpdate.cnic_back_url = cnicBackPath;
        if (Object.keys(profileUpdate).length > 0) {
          await supabase.from('worker_profiles').update(profileUpdate).eq('user_id', data.user.id);
        }
      }

      if (!data.session) {
        setNotice('checkEmail');
        setPassword('');
      } else {
        setNotice('pendingApproval');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : en('auth.error.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <BiText id="register.professional.title" variant="title" tone="strong" style={styles.title} />
        <BiText id="register.professional.subtitle" variant="bodySm" tone="muted" style={styles.subtitle} />

        <Card padding="lg">
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
              onPress={() => pickCnicImage('front')}
            />
            <CnicUploadBox
              labelId="register.professional.cnicBack"
              uri={cnicBackUri}
              onPress={() => pickCnicImage('back')}
            />
          </View>
          <Input
            value={city}
            onChangeText={setCity}
            labelId="register.professional.city"
            placeholderId="register.professional.cityPh"
            iconLeft="map-pin"
          />

          <BiText id="register.professional.skillCategory" variant="label" tone="muted" style={styles.sectionLabel} />
          <View style={styles.skillGrid}>
            {SKILL_CATEGORIES.map((cat) => {
              const active = skillKey === cat.key;
              const label = t(cat.labelId);
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setSkillKey(cat.key)}
                  accessibilityRole="button"
                  style={[styles.skillChip, active && styles.skillChipActive]}
                >
                  <Image source={cat.icon} style={styles.skillChipIcon} resizeMode="contain" />
                  <Text style={[typography.label, styles.skillChipEn, active && styles.skillChipEnActive]}>
                    {label.en}
                  </Text>
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

          <Input
            value={workingHours}
            onChangeText={setWorkingHours}
            labelId="register.professional.workingHours"
            placeholderId="register.professional.workingHoursPh"
            iconLeft="clock"
          />

          <BiText id="register.professional.photo" variant="label" tone="muted" style={styles.sectionLabel} />
          <Pressable onPress={pickPhoto} accessibilityRole="button" style={styles.photoBox}>
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

          {!!error && (
            <View style={styles.errorBox}>
              <Icon name="alert-triangle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {notice === 'checkEmail' && (
            <View style={styles.notice}>
              <Banner id="auth.signup.checkEmail" tone="info" />
            </View>
          )}
          {notice === 'pendingApproval' && (
            <View style={styles.notice}>
              <Banner id="register.professional.pendingApproval" tone="success" />
            </View>
          )}

          <Button
            labelId={busy ? 'register.professional.submitting' : 'register.professional.submit'}
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
  photoPreview: { width: '100%', height: 140 },
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
  cnicPreview: { width: '100%', height: 90 },
  cnicUploadText: { color: colors.primaryDeep, marginTop: 4, textAlign: 'center' },
  cnicHintText: { color: colors.textMuted, marginTop: 2 },
  bioInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  errorText: { ...typography.bodySm, color: colors.danger, marginLeft: spacing.xs, flex: 1 },
  notice: { marginBottom: spacing.sm },
  submitBtn: { marginTop: spacing.sm },
  termsNotice: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
});
