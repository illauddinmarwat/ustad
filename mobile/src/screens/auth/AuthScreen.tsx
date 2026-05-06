import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'signin' | 'signup') => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.heroCard}>
        <Text style={styles.brand}>WorkerzPk</Text>
        <Text style={styles.heroTitle}>Find local skilled workers quickly</Text>
        <Text style={styles.heroSub}>Post tasks, compare responses, and hire with confidence.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Welcome back</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          style={styles.input}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.btn, styles.primary]} disabled={busy} onPress={() => run('signin')}>
          <Text style={styles.btnText}>Sign in</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.secondary]} disabled={busy} onPress={() => run('signup')}>
          <Text style={styles.btnTextDark}>Create account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: '#f1f5f9' },
  heroCard: {
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  brand: { color: '#e0f2fe', fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroSub: { color: '#e0f2fe', lineHeight: 20 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    padding: 14,
  },
  formTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  btn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  primary: { backgroundColor: '#0284c7' },
  secondary: { backgroundColor: '#e2e8f0' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnTextDark: { color: '#0f172a', fontWeight: '700' },
  error: { color: '#b91c1c', marginBottom: 8 },
});
