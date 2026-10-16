import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { en } from '../../i18n/useT';
import { requestPasswordReset, resetPasswordWithCode } from '../../lib/passwordReset';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { fontFamilies, typography, urduTypography } from '../../theme/typography';

export default function AuthScreen() {
  const { signIn } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signin' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState<'off' | 'email' | 'code'>('off');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const sendCode = async () => {
    if (!email.trim()) {
      setError(en('auth.forgot.needEmail'));
      return;
    }
    setResetBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setForgot('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : en('auth.error.failed'));
    } finally {
      setResetBusy(false);
    }
  };

  const saveNewPassword = async () => {
    if (!code.trim() || newPassword.length < 6) {
      setError(en('auth.forgot.needFields'));
      return;
    }
    setResetBusy(true);
    setError(null);
    try {
      // Verifying the code signs the user in, so the auth state takes over from here.
      await resetPasswordWithCode(email, code, newPassword);
      popIfPossible();
    } catch (e) {
      setError(e instanceof Error ? e.message : en('auth.error.failed'));
    } finally {
      setResetBusy(false);
    }
  };

  const popIfPossible = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  const run = async (mode: 'signin') => {
    setBusy(mode);
    setError(null);
    try {
      await signIn(email.trim(), password);
      popIfPossible();
    } catch (e) {
      setError(e instanceof Error ? e.message : en('auth.error.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Icon name="zap" size={18} color={colors.primaryInk} />
            </View>
            <Text style={styles.brandText}>Ustad</Text>
            <Text style={styles.brandUrdu}>استاد</Text>
          </View>
          <BiText id="auth.hero.title" variant="displayLg" tone="inverse" style={styles.heroTitle} />
          <BiText id="auth.hero.subtitle" variant="body" tone="inverse" style={styles.heroSub} />
        </LinearGradient>

        <Card padding="lg">
          <BiText id={forgot === 'off' ? 'auth.welcome' : 'auth.forgot.title'} variant="title" tone="strong" style={styles.formTitle} />
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
          {forgot === 'off' && (
            <>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderId="common.password"
            labelId="common.password"
            iconLeft="lock"
            textContentType="password"
          />
            </>
          )}
          {forgot === 'code' && (
            <>
              <Banner id="auth.forgot.codeSent" tone="info" />
              <Input
                value={code}
                onChangeText={setCode}
                autoCapitalize="none"
                keyboardType="number-pad"
                placeholderId="auth.forgot.code"
                labelId="auth.forgot.code"
                iconLeft="key"
              />
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholderId="auth.forgot.newPassword"
                labelId="auth.forgot.newPassword"
                iconLeft="lock"
                textContentType="newPassword"
              />
            </>
          )}
          {!!error && (
            <View style={styles.errorBox}>
              <Icon name="alert-triangle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {forgot === 'off' ? (
            <>
          <Button
            labelId="common.signIn"
            onPress={() => run('signin')}
            loading={busy === 'signin'}
            disabled={busy !== null}
            size="lg"
            fullWidth
            iconRight="arrow-right"
            style={styles.primaryBtn}
          />
          <Button
            labelId="common.createAccount"
            onPress={() => navigation.navigate('RegisterChoice')}
            disabled={busy !== null}
            variant="secondary"
            size="lg"
            fullWidth
            style={styles.secondaryBtn}
          />
              <Button
                labelId="auth.forgot.link"
                onPress={() => {
                  setError(null);
                  setForgot('email');
                }}
                disabled={busy !== null}
                variant="ghost"
                fullWidth
                style={styles.secondaryBtn}
              />
            </>
          ) : (
            <>
              <Button
                labelId={forgot === 'email' ? 'auth.forgot.sendCode' : 'auth.forgot.save'}
                onPress={forgot === 'email' ? sendCode : saveNewPassword}
                loading={resetBusy}
                size="lg"
                fullWidth
                style={styles.primaryBtn}
              />
              <Button
                labelId="auth.forgot.back"
                onPress={() => {
                  setError(null);
                  setForgot('off');
                }}
                variant="ghost"
                fullWidth
                style={styles.secondaryBtn}
              />
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  brandText: {
    ...typography.title,
    fontFamily: fontFamilies.displayBold,
    color: colors.primaryInk,
    letterSpacing: 0.3,
  },
  brandUrdu: {
    ...urduTypography.label,
    color: 'rgba(255,255,255,0.85)',
    marginLeft: spacing.sm,
  },
  heroTitle: { marginBottom: spacing.sm },
  heroSub: {},
  formTitle: { marginBottom: spacing.md },
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
  primaryBtn: { marginTop: spacing.md },
  secondaryBtn: { marginTop: spacing.sm },
});
