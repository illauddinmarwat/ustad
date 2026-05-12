import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { en } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { fontFamilies, typography, urduTypography } from '../../theme/typography';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signin' | 'signup' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'signin' | 'signup') => {
    setBusy(mode);
    setError(null);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : en('auth.error.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.lg }]}
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
            <Text style={styles.brandText}>WorkerzPk</Text>
            <Text style={styles.brandUrdu}>ورکرز پی کے</Text>
          </View>
          <BiText id="auth.hero.title" variant="displayLg" tone="inverse" style={styles.heroTitle} />
          <BiText id="auth.hero.subtitle" variant="body" tone="inverse" style={styles.heroSub} />
        </LinearGradient>

        <Card padding="lg">
          <BiText id="auth.welcome" variant="title" tone="strong" style={styles.formTitle} />
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
            textContentType="password"
          />
          {!!error && (
            <View style={styles.errorBox}>
              <Icon name="alert-triangle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
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
            onPress={() => run('signup')}
            loading={busy === 'signup'}
            disabled={busy !== null}
            variant="secondary"
            size="lg"
            fullWidth
            style={styles.secondaryBtn}
          />
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
  primaryBtn: { marginTop: spacing.md },
  secondaryBtn: { marginTop: spacing.sm },
});
