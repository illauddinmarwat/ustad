import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { fixtureListings, fixtureTemplates } from '../dev/fixtures';
import { useFixtureMode, useLiveDatabase } from '../config/env';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen(_props: Props) {
  const { session, previewRole, setPreviewRole, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>WorkerzPk — Phase 1</Text>

      <View style={styles.badge}>
        <Text style={styles.badgeTitle}>Runtime mode</Text>
        <Text style={styles.badgeText}>
          {useFixtureMode ? 'Fixture mode (no database)' : useLiveDatabase ? 'Live Supabase' : 'Not configured'}
        </Text>
        {!useFixtureMode && (
          <Text style={styles.hint}>Set EXPO_PUBLIC_USE_FIXTURES=1 for offline UI, or add Supabase URL + anon key.</Text>
        )}
      </View>

      {useFixtureMode && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preview as</Text>
          <View style={styles.row}>
            {(['customer', 'worker'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setPreviewRole(r)}
                style={[styles.roleBtn, previewRole === r && styles.roleBtnActive]}
              >
                <Text style={[styles.roleBtnLabel, previewRole === r && styles.roleBtnLabelActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.mono}>fixture user id: {session?.user?.id ?? '—'}</Text>
        </View>
      )}

      {useFixtureMode && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sample templates ({fixtureTemplates.length})</Text>
          {fixtureTemplates.map((t) => (
            <Text key={t.id} style={styles.rowItem}>
              • {t.title} ({t.category})
            </Text>
          ))}
          <Text style={[styles.cardTitle, { marginTop: 12 }]}>Sample listings ({fixtureListings.length})</Text>
          {fixtureListings.map((l) => (
            <Text key={l.id} style={styles.rowItem}>
              • {l.headline} — Rs {l.price_pkr}
            </Text>
          ))}
        </View>
      )}

      <Pressable onPress={() => signOut()} style={styles.link}>
        <Text style={styles.linkText}>{useFixtureMode ? 'Reset fixture session' : 'Sign out'}</Text>
      </Pressable>

      <Text style={styles.list}>
        {['React Native Expo', '@supabase/supabase-js', 'React Navigation'].join(' · ')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 48,
    backgroundColor: '#f8fafc',
    flexGrow: 1,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  badge: {
    backgroundColor: '#e0f2fe',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  badgeTitle: { fontSize: 12, fontWeight: '700', color: '#0369a1', marginBottom: 4 },
  badgeText: { color: '#0c4a6e', fontWeight: '600' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 8, lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  rowItem: { fontSize: 14, color: '#475569', marginBottom: 4 },
  roleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  roleBtnActive: { backgroundColor: '#0ea5e9' },
  roleBtnLabel: { color: '#475569', fontWeight: '600', textTransform: 'capitalize' },
  roleBtnLabelActive: { color: '#fff' },
  mono: { fontSize: 11, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' },
  link: { marginVertical: 8 },
  linkText: { color: '#0284c7', fontWeight: '600', fontSize: 15 },
  list: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
});
