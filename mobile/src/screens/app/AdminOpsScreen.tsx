import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppCard, PrimaryButton, SectionHeader, StatusPill } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { normalizeCityCode, normalizeRolloutStage, ROLLOUT_STAGE_OPTIONS } from '../../lib/phase5AdminRollout';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../theme/tokens';

type ProfileRow = { id: string; display_name: string | null; role: string; status: string };
type ReportRow = { id: string; reason: string; status: string; reported_user_id: string | null; created_at: string };
type LedgerRow = { id: string; amount_pkr: number; status: string; job_id: string };
type TemplateRow = { id: string; title: string; active: boolean };
type ExtractionRow = {
  id: string;
  worker_id: string;
  doc_type: string;
  provider: string;
  status: string;
  confidence: number | null;
  parsed: Record<string, string | null>;
  created_at: string;
};

type FaqAdminRow = {
  id: string;
  slug: string;
  category: string;
  question_en: string;
  question_ur: string | null;
  answer_en: string;
  answer_ur: string | null;
  search_terms: string[] | null;
  is_active: boolean;
};

type CityRow = { id: string; code: string; name: string; is_active: boolean };
type CityRolloutRow = {
  city_id: string;
  booking_enabled: boolean;
  discovery_enabled: boolean;
  campaigns_enabled: boolean;
  community_enabled: boolean;
  go_live_at: string | null;
};
type CityServiceAvailabilityRow = {
  id: string;
  city_id: string;
  template_id: string;
  is_enabled: boolean;
  rollout_stage: 'off' | 'pilot' | 'live';
};

export default function AdminOpsScreen() {
  const { role, session } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [extractions, setExtractions] = useState<ExtractionRow[]>([]);
  const [providerCounts, setProviderCounts] = useState<Record<string, number>>({});
  const [faqs, setFaqs] = useState<FaqAdminRow[]>([]);
  const [faqSlug, setFaqSlug] = useState('');
  const [faqCategory, setFaqCategory] = useState('getting-started');
  const [faqQen, setFaqQen] = useState('');
  const [faqQur, setFaqQur] = useState('');
  const [faqAen, setFaqAen] = useState('');
  const [faqAur, setFaqAur] = useState('');
  const [faqTerms, setFaqTerms] = useState('');
  const [q, setQ] = useState('');
  const [cities, setCities] = useState<CityRow[]>([]);
  const [cityRollouts, setCityRollouts] = useState<CityRolloutRow[]>([]);
  const [cityAvailability, setCityAvailability] = useState<CityServiceAvailabilityRow[]>([]);
  const [cityCode, setCityCode] = useState('karachi');
  const [cityName, setCityName] = useState('Karachi');
  const [cityActive, setCityActive] = useState(true);
  const [rolloutBooking, setRolloutBooking] = useState(false);
  const [rolloutDiscovery, setRolloutDiscovery] = useState(false);
  const [rolloutCampaigns, setRolloutCampaigns] = useState(false);
  const [rolloutCommunity, setRolloutCommunity] = useState(false);
  const [serviceTemplateId, setServiceTemplateId] = useState('');
  const [serviceEnabled, setServiceEnabled] = useState(true);
  const [serviceStage, setServiceStage] = useState<'off' | 'pilot' | 'live'>('pilot');
  const [msg, setMsg] = useState<string | null>(null);

  const setAppFlag = async (key: string, value: boolean) => {
    const { error } = await supabase.rpc('admin_set_app_setting', {
      p_key: key,
      p_value: value,
    });
    setMsg(error ? error.message : `${key} set to ${value}`);
  };

  const load = async () => {
    const [p, r, l, t, e, allE, fq, c, cr, ca] = await Promise.all([
      supabase.from('profiles').select('id,display_name,role,status').order('created_at', { ascending: false }).limit(50),
      supabase.from('abuse_reports').select('id,reason,status,reported_user_id,created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
      supabase.from('payment_ledger').select('id,amount_pkr,status,job_id').order('created_at', { ascending: false }).limit(20),
      supabase.from('service_templates').select('id,title,active').order('created_at', { ascending: false }).limit(30),
      supabase
        .from('ocr_extractions')
        .select('id,worker_id,doc_type,provider,status,confidence,parsed,created_at')
        .in('status', ['pending', 'parsed', 'manual_fallback'])
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('ocr_extractions')
        .select('provider,status')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('faqs')
        .select('id,slug,category,question_en,question_ur,answer_en,answer_ur,search_terms,is_active')
        .order('category', { ascending: true }),
      supabase.from('cities').select('id,code,name,is_active').order('code', { ascending: true }),
      supabase
        .from('city_rollout_configs')
        .select('city_id,booking_enabled,discovery_enabled,campaigns_enabled,community_enabled,go_live_at'),
      supabase
        .from('city_service_availability')
        .select('id,city_id,template_id,is_enabled,rollout_stage')
        .order('updated_at', { ascending: false })
        .limit(100),
    ]);
    if (p.data) setProfiles(p.data as ProfileRow[]);
    if (r.data) setReports(r.data as ReportRow[]);
    if (l.data) setLedgerRows(l.data as LedgerRow[]);
    if (t.data) setTemplates(t.data as TemplateRow[]);
    if (e.data) setExtractions(e.data as ExtractionRow[]);
    if (allE.data) {
      const counts: Record<string, number> = {};
      (allE.data as Array<{ provider: string; status: string }>).forEach((row) => {
        const key = `${row.provider}:${row.status}`;
        counts[key] = (counts[key] ?? 0) + 1;
      });
      setProviderCounts(counts);
    }
    if (fq.data) setFaqs(fq.data as FaqAdminRow[]);
    if (c.data) setCities(c.data as CityRow[]);
    if (cr.data) setCityRollouts(cr.data as CityRolloutRow[]);
    if (ca.data) setCityAvailability(ca.data as CityServiceAvailabilityRow[]);
  };

  useEffect(() => {
    load().catch(() => setMsg('Failed to load admin data'));
  }, []);

  const suspendUser = async (userId: string) => {
    const { error } = await supabase.rpc('admin_set_user_status', { p_user_id: userId, p_status: 'suspended' });
    setMsg(error ? error.message : 'User suspended');
    if (!error) await load();
  };

  const activateUser = async (userId: string) => {
    const { error } = await supabase.rpc('admin_set_user_status', { p_user_id: userId, p_status: 'active' });
    setMsg(error ? error.message : 'User activated');
    if (!error) await load();
  };

  const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: reportId,
      p_status: status,
      p_admin_note: `Set by admin as ${status}`,
    });
    setMsg(error ? error.message : `Report ${status}`);
    if (!error) await load();
  };

  const setPaymentStatus = async (ledgerId: string, status: 'disputed' | 'refunded' | 'paid') => {
    const { error } = await supabase.rpc('admin_update_payment_status', {
      p_ledger_id: ledgerId,
      p_status: status,
      p_note: `Admin set ${status}`,
    });
    setMsg(error ? error.message : `Payment marked ${status}`);
    if (!error) await load();
  };

  const setTemplateActive = async (templateId: string, active: boolean) => {
    const { error } = await supabase.rpc('admin_set_template_active', {
      p_template_id: templateId,
      p_active: active,
    });
    setMsg(error ? error.message : `Template ${active ? 'activated' : 'paused'}`);
    if (!error) await load();
  };

  const setExtractionStatus = async (extractionId: string, status: 'verified' | 'rejected') => {
    const { error } = await supabase.rpc('admin_set_extraction_status', {
      p_extraction_id: extractionId,
      p_status: status,
      p_admin_note: `Admin marked ${status}`,
    });
    setMsg(error ? error.message : `Extraction ${status}`);
    if (!error) await load();
  };

  const backfillSignals = async () => {
    const { data, error } = await supabase.rpc('admin_backfill_worker_signals');
    setMsg(error ? error.message : `Backfilled ${data ?? 0} workers`);
  };

  const upsertCity = async () => {
    const code = normalizeCityCode(cityCode);
    if (!code || !cityName.trim()) {
      setMsg('City code and name are required');
      return;
    }
    const { error } = await supabase.rpc('admin_upsert_city', {
      p_code: code,
      p_name: cityName.trim(),
      p_is_active: cityActive,
    });
    setMsg(error ? error.message : `City ${code} saved`);
    if (!error) await load();
  };

  const saveRollout = async () => {
    const code = normalizeCityCode(cityCode);
    if (!code) {
      setMsg('City code is required');
      return;
    }
    const { error } = await supabase.rpc('admin_set_city_rollout_config', {
      p_city_code: code,
      p_booking_enabled: rolloutBooking,
      p_discovery_enabled: rolloutDiscovery,
      p_campaigns_enabled: rolloutCampaigns,
      p_community_enabled: rolloutCommunity,
      p_go_live_at: null,
      p_notes: 'Updated from Admin Ops',
    });
    setMsg(error ? error.message : `Rollout config updated for ${code}`);
    if (!error) await load();
  };

  const saveServiceAvailability = async () => {
    const code = normalizeCityCode(cityCode);
    if (!code || !serviceTemplateId.trim()) {
      setMsg('City code and template id are required');
      return;
    }
    const { error } = await supabase.rpc('admin_set_city_service_availability', {
      p_city_code: code,
      p_template_id: serviceTemplateId.trim(),
      p_is_enabled: serviceEnabled,
      p_rollout_stage: normalizeRolloutStage(serviceStage),
    });
    setMsg(error ? error.message : `Service availability updated for ${code}`);
    if (!error) await load();
  };

  const addFaq = async () => {
    const slug = faqSlug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug || !faqQen.trim() || !faqAen.trim()) {
      setMsg('FAQ slug, English question, and English answer are required');
      return;
    }
    const terms = faqTerms
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const { error } = await supabase.from('faqs').insert({
      slug,
      category: faqCategory.trim() || 'general',
      question_en: faqQen.trim(),
      question_ur: faqQur.trim() || null,
      answer_en: faqAen.trim(),
      answer_ur: faqAur.trim() || null,
      search_terms: terms,
      is_active: true,
    });
    setMsg(error ? error.message : 'FAQ created');
    if (!error) {
      setFaqSlug('');
      setFaqQen('');
      setFaqQur('');
      setFaqAen('');
      setFaqAur('');
      setFaqTerms('');
      await load();
    }
  };

  const toggleFaqActive = async (row: FaqAdminRow) => {
    const { error } = await supabase.from('faqs').update({ is_active: !row.is_active }).eq('id', row.id);
    setMsg(error ? error.message : `FAQ ${row.is_active ? 'paused' : 'activated'}`);
    if (!error) await load();
  };

  if (!session?.user.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in required.</Text>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Admin access only.</Text>
      </View>
    );
  }

  const filtered = profiles.filter((p) => {
    const key = `${p.display_name ?? ''} ${p.role} ${p.id}`.toLowerCase();
    return key.includes(q.toLowerCase());
  });

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <AppCard>
        <SectionHeader title="Admin Ops" subtitle="User status controls and report queue." />
      </AppCard>

      <AppCard>
        <SectionHeader
          title="Phase feature flags"
          subtitle="Phase 4 features stay disabled by default; admins can flip rollout gates here."
        />
        <View style={styles.row}>
          <Text style={styles.strong}>phase4_realtime_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase4_realtime_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase4_realtime_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase4_subscriptions_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase4_subscriptions_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase4_subscriptions_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase4_boosts_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase4_boosts_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase4_boosts_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase4_quality_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase4_quality_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase4_quality_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase4_web_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase4_web_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase4_web_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase5_multi_city_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase5_multi_city_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase5_multi_city_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase5_city_campaigns_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase5_city_campaigns_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase5_city_campaigns_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>phase5_city_community_enabled</Text>
          <Pressable onPress={() => setAppFlag('phase5_city_community_enabled', true)}>
            <Text style={styles.link}>Enable</Text>
          </Pressable>
          <Pressable onPress={() => setAppFlag('phase5_city_community_enabled', false)}>
            <Text style={styles.danger}>Disable</Text>
          </Pressable>
        </View>
      </AppCard>

      {!!msg && <Text style={styles.msg}>{msg}</Text>}

      <AppCard>
        <SectionHeader
          title="Phase 5 city rollout controls"
          subtitle="Admin-only city, rollout, and service-stage controls."
        />
        <TextInput value={cityCode} onChangeText={setCityCode} placeholder="City code (e.g. lahore)" style={styles.input} />
        <TextInput value={cityName} onChangeText={setCityName} placeholder="City name" style={styles.input} />
        <View style={styles.row}>
          <Text style={styles.strong}>City active</Text>
          <Pressable onPress={() => setCityActive(true)}>
            <Text style={styles.link}>Yes</Text>
          </Pressable>
          <Pressable onPress={() => setCityActive(false)}>
            <Text style={styles.danger}>No</Text>
          </Pressable>
        </View>
        <PrimaryButton label="Save city" onPress={upsertCity} />
        <View style={styles.row}>
          <Text style={styles.strong}>Booking</Text>
          <Pressable onPress={() => setRolloutBooking(true)}>
            <Text style={styles.link}>On</Text>
          </Pressable>
          <Pressable onPress={() => setRolloutBooking(false)}>
            <Text style={styles.danger}>Off</Text>
          </Pressable>
          <Text style={styles.strong}>Discovery</Text>
          <Pressable onPress={() => setRolloutDiscovery(true)}>
            <Text style={styles.link}>On</Text>
          </Pressable>
          <Pressable onPress={() => setRolloutDiscovery(false)}>
            <Text style={styles.danger}>Off</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>Campaigns</Text>
          <Pressable onPress={() => setRolloutCampaigns(true)}>
            <Text style={styles.link}>On</Text>
          </Pressable>
          <Pressable onPress={() => setRolloutCampaigns(false)}>
            <Text style={styles.danger}>Off</Text>
          </Pressable>
          <Text style={styles.strong}>Community</Text>
          <Pressable onPress={() => setRolloutCommunity(true)}>
            <Text style={styles.link}>On</Text>
          </Pressable>
          <Pressable onPress={() => setRolloutCommunity(false)}>
            <Text style={styles.danger}>Off</Text>
          </Pressable>
        </View>
        <PrimaryButton label="Save rollout config" onPress={saveRollout} />
        <TextInput
          value={serviceTemplateId}
          onChangeText={setServiceTemplateId}
          placeholder="Template id for city availability"
          style={styles.input}
        />
        <View style={styles.row}>
          <Text style={styles.strong}>Service enabled</Text>
          <Pressable onPress={() => setServiceEnabled(true)}>
            <Text style={styles.link}>Yes</Text>
          </Pressable>
          <Pressable onPress={() => setServiceEnabled(false)}>
            <Text style={styles.danger}>No</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={styles.strong}>Stage</Text>
          {ROLLOUT_STAGE_OPTIONS.map((opt) => (
            <Pressable key={opt} onPress={() => setServiceStage(opt)}>
              <Text style={opt === serviceStage ? styles.link : styles.meta}>{opt}</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Save service availability" onPress={saveServiceAvailability} />
      </AppCard>

      <AppCard>
        <SectionHeader title="Current city rollout snapshot" />
        {cities.length === 0 ? <Text style={styles.meta}>No cities configured yet.</Text> : null}
        {cities.map((c) => {
          const rollout = cityRollouts.find((r) => r.city_id === c.id);
          const availCount = cityAvailability.filter((a) => a.city_id === c.id).length;
          return (
            <View key={c.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>
                  {c.code} · {c.name}
                </Text>
                <Text style={styles.meta}>
                  active={String(c.is_active)} booking={String(rollout?.booking_enabled ?? false)} discovery=
                  {String(rollout?.discovery_enabled ?? false)}
                </Text>
                <Text style={styles.meta}>service rules: {availCount}</Text>
              </View>
            </View>
          );
        })}
      </AppCard>

      <AppCard>
        <SectionHeader title="User search" />
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name / role / id" style={styles.input} />
        {filtered.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{p.display_name ?? p.id.slice(0, 8)}</Text>
              <Text style={styles.meta}>{p.role}</Text>
            </View>
            <StatusPill label={p.status} />
            {p.status === 'active' ? (
              <Pressable onPress={() => suspendUser(p.id)}>
                <Text style={styles.danger}>Suspend</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => activateUser(p.id)}>
                <Text style={styles.link}>Activate</Text>
              </Pressable>
            )}
          </View>
        ))}
      </AppCard>

      <AppCard>
        <SectionHeader title="Open abuse reports" />
        {reports.length === 0 && <Text style={styles.meta}>No open reports.</Text>}
        {reports.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{r.reason}</Text>
              <Text style={styles.meta}>Reported user: {r.reported_user_id?.slice(0, 8) ?? 'n/a'}</Text>
            </View>
            <Pressable onPress={() => resolveReport(r.id, 'resolved')}>
              <Text style={styles.link}>Resolve</Text>
            </Pressable>
            <Pressable onPress={() => resolveReport(r.id, 'dismissed')}>
              <Text style={styles.danger}>Dismiss</Text>
            </Pressable>
          </View>
        ))}
      </AppCard>

      <AppCard>
        <SectionHeader title="Payment reconciliation queue" />
        {ledgerRows.length === 0 && <Text style={styles.meta}>No ledger rows yet.</Text>}
        {ledgerRows.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>Rs {r.amount_pkr}</Text>
              <Text style={styles.meta}>Job: {r.job_id.slice(0, 8)}</Text>
            </View>
            <StatusPill label={r.status} />
            <Pressable onPress={() => setPaymentStatus(r.id, 'disputed')}>
              <Text style={styles.danger}>Dispute</Text>
            </Pressable>
            <Pressable onPress={() => setPaymentStatus(r.id, 'refunded')}>
              <Text style={styles.link}>Refund</Text>
            </Pressable>
          </View>
        ))}
      </AppCard>

      <AppCard>
        <SectionHeader title="Template management" />
        {templates.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{t.title}</Text>
            </View>
            <StatusPill label={t.active ? 'active' : 'paused'} />
            <Pressable onPress={() => setTemplateActive(t.id, !t.active)}>
              <Text style={styles.link}>{t.active ? 'Pause' : 'Activate'}</Text>
            </Pressable>
          </View>
        ))}
      </AppCard>

      <AppCard>
        <SectionHeader
          title="FAQ knowledge base"
          subtitle="Curated bilingual entries power the FAQ + chat help surfaces."
        />
        {faqs.map((f) => (
          <View key={f.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{f.slug}</Text>
              <Text style={styles.meta}>{f.category}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {f.question_en}
              </Text>
            </View>
            <StatusPill label={f.is_active ? 'active' : 'paused'} />
            <Pressable onPress={() => toggleFaqActive(f)}>
              <Text style={styles.link}>{f.is_active ? 'Pause' : 'Activate'}</Text>
            </Pressable>
          </View>
        ))}
        <Text style={[styles.meta, { marginTop: spacing.sm }]}>Add new FAQ</Text>
        <TextInput value={faqSlug} onChangeText={setFaqSlug} placeholder="slug (e.g. how-to-pay)" style={styles.input} />
        <TextInput
          value={faqCategory}
          onChangeText={setFaqCategory}
          placeholder="category"
          style={styles.input}
        />
        <TextInput
          value={faqQen}
          onChangeText={setFaqQen}
          placeholder="Question (English)"
          style={styles.input}
        />
        <TextInput
          value={faqQur}
          onChangeText={setFaqQur}
          placeholder="Question (Urdu, optional)"
          style={styles.input}
        />
        <TextInput
          value={faqAen}
          onChangeText={setFaqAen}
          placeholder="Answer (English)"
          style={styles.input}
          multiline
        />
        <TextInput
          value={faqAur}
          onChangeText={setFaqAur}
          placeholder="Answer (Urdu, optional)"
          style={styles.input}
          multiline
        />
        <TextInput
          value={faqTerms}
          onChangeText={setFaqTerms}
          placeholder="search terms, comma-separated"
          style={styles.input}
        />
        <PrimaryButton label="Create FAQ" onPress={addFaq} />
      </AppCard>

      <AppCard>
        <SectionHeader
          title="Document verification queue"
          subtitle="Review OCR extractions submitted by workers."
        />
        {extractions.length === 0 && <Text style={styles.meta}>No pending extractions.</Text>}
        {extractions.map((e) => (
          <View key={e.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>
                {e.doc_type.toUpperCase()} · {e.provider}
              </Text>
              <Text style={styles.meta}>Worker: {e.worker_id.slice(0, 8)}</Text>
              <Text style={styles.meta}>
                {Object.entries(e.parsed ?? {})
                  .filter(([, v]) => !!v)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ') || 'No parsed fields'}
              </Text>
              <Text style={styles.meta}>
                Confidence: {e.confidence != null ? `${Math.round(e.confidence * 100)}%` : 'n/a'}
              </Text>
            </View>
            <StatusPill label={e.status} />
            <Pressable onPress={() => setExtractionStatus(e.id, 'verified')}>
              <Text style={styles.link}>Verify</Text>
            </Pressable>
            <Pressable onPress={() => setExtractionStatus(e.id, 'rejected')}>
              <Text style={styles.danger}>Reject</Text>
            </Pressable>
          </View>
        ))}
      </AppCard>

      <AppCard>
        <SectionHeader
          title="OCR provider health"
          subtitle="Counts by provider × status (last 500 events)."
        />
        {Object.keys(providerCounts).length === 0 ? (
          <Text style={styles.meta}>No OCR runs recorded yet.</Text>
        ) : (
          Object.entries(providerCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, count]) => (
              <View key={key} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{key}</Text>
                </View>
                <Text style={styles.meta}>{count}</Text>
              </View>
            ))
        )}
      </AppCard>

      <AppCard>
        <SectionHeader
          title="Ranking signal backfill"
          subtitle="Recompute response_rate / completion_rate / last_active_at for every active worker."
        />
        <PrimaryButton label="Run backfill now" onPress={backfillSignals} />
      </AppCard>

      <PrimaryButton label="Refresh" onPress={() => load().catch(() => setMsg('Failed to refresh'))} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, paddingBottom: 44 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  muted: { color: colors.textMuted },
  msg: { color: colors.primaryDeep, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.textStrong,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  strong: { color: colors.textStrong, fontWeight: '700' },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 12 },
  link: { color: colors.primary, fontWeight: '700' },
  danger: { color: colors.danger, fontWeight: '700' },
});
