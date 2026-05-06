import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Listing = { id: string; headline: string; price_pkr: number; worker_id: string; template_id: string };
type Job = { id: string; title: string; status: string; origin: string; worker_id: string | null; customer_id: string };

export default function HomeScreen() {
  const { session, role, signOut, setRole } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const categories = useMemo(() => ['Plumbing', 'Electrical', 'Cleaning', 'AC Service', 'Handyman'], []);

  const load = async () => {
    const [l, j] = await Promise.all([
      supabase.from('worker_service_listings').select('*').eq('status', 'active').limit(20),
      supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    if (l.data) setListings(l.data as Listing[]);
    if (j.data) setJobs(j.data as Job[]);
  };

  useEffect(() => {
    load().catch(() => setMessage('Failed to load data'));
  }, []);

  const apply = async (listingId: string) => {
    if (!session?.user.id) return;
    const { error } = await supabase.from('listing_applications').insert({
      listing_id: listingId,
      customer_id: session.user.id,
      note: 'Need service',
      location_text: 'Lahore',
      preferred_time: 'Flexible',
    });
    setMessage(error ? error.message : 'Applied successfully');
  };

  const postJob = async () => {
    if (!session?.user.id || !jobTitle.trim()) return;
    const { error } = await supabase.from('jobs').insert({
      customer_id: session.user.id,
      title: jobTitle.trim(),
      category: 'general',
      description: 'Posted from app',
      status: 'open',
      origin: 'customer_job',
      worker_id: null,
    });
    if (!error) {
      setJobTitle('');
      await load();
    }
    setMessage(error ? error.message : 'Job posted');
  };

  const confirmBooking = async (jobId: string) => {
    const { error } = await supabase.rpc('customer_confirm_booking', { job_id: jobId });
    setMessage(error ? error.message : 'Booking confirmed');
    if (!error) await load();
  };

  const markComplete = async (jobId: string) => {
    const { error } = await supabase.rpc('mark_job_completed', { job_id: jobId });
    setMessage(error ? error.message : 'Marked completed');
    if (!error) await load();
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Get Free Quotes from Local Skilled Workers</Text>
        <Text style={styles.heroSub}>Post your task in seconds, receive offers, and hire confidently.</Text>
        <View style={styles.heroRow}>
          <Pressable style={styles.heroBtnPrimary} onPress={postJob}>
            <Text style={styles.heroBtnPrimaryText}>Post a Task</Text>
          </Pressable>
          <Pressable style={styles.heroBtnSecondary} onPress={() => load()}>
            <Text style={styles.heroBtnSecondaryText}>Refresh Listings</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Account</Text>
        <Text style={styles.meta}>Logged in: {session?.user.email}</Text>
        <Text style={styles.meta}>Current role: {role ?? 'unknown'}</Text>
        <View style={styles.row}>
          <Pressable style={styles.smallBtn} onPress={() => setRole('customer')}>
            <Text style={styles.smallBtnText}>Customer</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={() => setRole('worker')}>
            <Text style={styles.smallBtnText}>Worker</Text>
          </Pressable>
          <Pressable style={[styles.smallBtn, { backgroundColor: '#dc2626' }]} onPress={signOut}>
            <Text style={styles.smallBtnText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>How WorkerzPk Works</Text>
        <View style={styles.steps}>
          <View style={styles.stepCard}>
            <Text style={styles.stepNum}>01</Text>
            <Text style={styles.stepTitle}>Post Your Task</Text>
            <Text style={styles.stepText}>Share details, location, and photos.</Text>
          </View>
          <View style={styles.stepCard}>
            <Text style={styles.stepNum}>02</Text>
            <Text style={styles.stepTitle}>Receive Responses</Text>
            <Text style={styles.stepText}>Workers quote or accept service applications.</Text>
          </View>
          <View style={styles.stepCard}>
            <Text style={styles.stepNum}>03</Text>
            <Text style={styles.stepTitle}>Confirm & Complete</Text>
            <Text style={styles.stepText}>Confirm booking, complete job, and review.</Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Popular Categories</Text>
        <View style={styles.chips}>
          {categories.map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>
      </View>

      {!!message && <Text style={styles.msg}>{message}</Text>}

      {role === 'customer' && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Post a Custom Job (Rail A)</Text>
          <TextInput
            placeholder="e.g., Need plumber for kitchen leak"
            value={jobTitle}
            onChangeText={setJobTitle}
            style={styles.input}
          />
          <Pressable style={styles.btn} onPress={postJob}>
            <Text style={styles.btnText}>Post Job</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Browse Services (Rail B)</Text>
        {listings.length === 0 && <Text style={styles.empty}>No active listings yet.</Text>}
        {listings.map((l) => (
          <View key={l.id} style={styles.listingCard}>
            <View>
              <Text style={styles.listingTitle}>{l.headline}</Text>
              <Text style={styles.listingMeta}>From Rs {l.price_pkr}</Text>
              <Text style={styles.rating}>4.9 ?  |  Verified profile</Text>
            </View>
            {role === 'customer' && (
              <Pressable style={styles.applyBtn} onPress={() => apply(l.id)}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recent Jobs</Text>
        {jobs.length === 0 && <Text style={styles.empty}>No jobs yet.</Text>}
        {jobs.map((j) => (
          <View key={j.id} style={styles.jobCard}>
            <Text style={styles.jobTitle}>{j.title}</Text>
            <Text style={styles.jobMeta}>
              Origin: {j.origin} | Status: {j.status}
            </Text>
            <View style={styles.actionRow}>
              {role === 'customer' && j.status === 'pending_customer_confirm' && (
                <Pressable onPress={() => confirmBooking(j.id)}>
                  <Text style={styles.link}>Confirm booking</Text>
                </Pressable>
              )}
              {(role === 'customer' || role === 'worker') && j.status === 'assigned' && (
                <Pressable onPress={() => markComplete(j.id)}>
                  <Text style={styles.link}>Mark complete</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, backgroundColor: '#f1f5f9', flexGrow: 1 },
  hero: {
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginBottom: 8 },
  heroSub: { color: '#e0f2fe', lineHeight: 20, marginBottom: 12 },
  heroRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  heroBtnPrimary: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  heroBtnPrimaryText: { color: '#0369a1', fontWeight: '800' },
  heroBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  panel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  meta: { color: '#475569', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  smallBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  smallBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
  steps: { gap: 8 },
  stepCard: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10 },
  stepNum: { color: '#0284c7', fontWeight: '900', marginBottom: 3 },
  stepTitle: { fontWeight: '700', color: '#0f172a' },
  stepText: { color: '#64748b', fontSize: 12, marginTop: 2 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: '#e0f2fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: '#075985', fontWeight: '600', fontSize: 12 },
  msg: { color: '#075985', marginBottom: 10, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, marginBottom: 8 },
  btn: { backgroundColor: '#0284c7', paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  listingCard: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  listingTitle: { fontWeight: '700', color: '#0f172a' },
  listingMeta: { color: '#334155', marginTop: 2 },
  rating: { color: '#64748b', marginTop: 3, fontSize: 12 },
  applyBtn: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  applyBtnText: { color: '#fff', fontWeight: '700' },
  jobCard: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingVertical: 10 },
  jobTitle: { fontWeight: '700', color: '#0f172a' },
  jobMeta: { color: '#475569', marginTop: 2, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  link: { color: '#0284c7', fontWeight: '700' },
  empty: { color: '#64748b', fontStyle: 'italic' },
});
