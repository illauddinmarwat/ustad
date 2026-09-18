import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { en } from '../../i18n/useT';
import type { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type Language = 'ur' | 'en';

export default function RegisterCustomerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [language, setLanguage] = useState<Language>('ur');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'checkEmail' | null>(null);

  const canSubmit = !!(email.trim() && password && fullName.trim() && mobile.trim() && city.trim());

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
            role: 'customer',
            display_name: fullName.trim(),
            phone: mobile.trim(),
            city: city.trim(),
            address: address.trim() || null,
            preferred_language: language,
          },
        },
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        setNotice('checkEmail');
        setPassword('');
      } else if (navigation.canGoBack()) {
        navigation.goBack();
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
        <BiText id="register.customer.title" variant="title" tone="strong" style={styles.title} />
        <BiText id="register.customer.subtitle" variant="bodySm" tone="muted" style={styles.subtitle} />

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

          <BiText id="register.customer.fullName" variant="label" tone="muted" style={styles.sectionLabel} />
          <Input value={fullName} onChangeText={setFullName} placeholderId="register.customer.fullNamePh" iconLeft="user" />

          <BiText id="register.customer.mobile" variant="label" tone="muted" style={styles.sectionLabel} />
          <Input
            value={mobile}
            onChangeText={setMobile}
            placeholderId="register.customer.mobilePh"
            iconLeft="phone"
            keyboardType="phone-pad"
          />

          <BiText id="register.customer.city" variant="label" tone="muted" style={styles.sectionLabel} />
          <Input value={city} onChangeText={setCity} placeholderId="register.customer.cityPh" iconLeft="map-pin" />

          <BiText id="register.customer.address" variant="label" tone="muted" style={styles.sectionLabel} />
          <Input value={address} onChangeText={setAddress} placeholderId="register.customer.addressPh" iconLeft="home" />

          <BiText id="register.customer.language" variant="label" tone="muted" style={styles.sectionLabel} />
          <View style={styles.langRow}>
            <LangPill label="اردو · Urdu" active={language === 'ur'} onPress={() => setLanguage('ur')} />
            <LangPill label="English" active={language === 'en'} onPress={() => setLanguage('en')} />
          </View>

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

          <Button
            labelId={busy ? 'register.customer.creating' : 'register.customer.submit'}
            onPress={submit}
            loading={busy}
            disabled={busy || !canSubmit}
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

function LangPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.langPill, active && styles.langPillActive]}
    >
      {active && <Icon name="check" size={14} color={colors.primaryInk} />}
      <Text style={[typography.label, styles.langPillLabel, active && styles.langPillLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, flexGrow: 1 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.lg },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs },
  langRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langPillLabel: { color: colors.textBody },
  langPillLabelActive: { color: colors.primaryInk },
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
