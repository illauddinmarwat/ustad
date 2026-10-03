import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useSkillCategories } from '../lib/skillCategories';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type Props = {
  /** Called after the trades were saved, so a screen that lists services can reload them. */
  onSaved?: (trades: string[]) => void;
  /** Without the card around it, for use inside another card. */
  bare?: boolean;
};

/** Every kind of work a Ustad does (an electrician who is also a plumber). Customers can request all of them. */
export function TradesSetting({ onSaved, bare }: Props) {
  const { session } = useAuth();
  const categories = useSkillCategories();
  const uid = session?.user.id;
  const [saved, setSaved] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'saved' | 'error' | 'none'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('worker_profiles').select('categories').eq('user_id', uid).maybeSingle();
      const list = ((data as { categories?: string[] | null } | null)?.categories ?? []).filter(Boolean);
      if (!cancelled) {
        setSaved(list);
        setPicked(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const toggle = (key: string) => {
    setState('idle');
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  };

  const changed = picked.length !== saved.length || picked.some((k) => !saved.includes(k));

  const save = async () => {
    if (picked.length === 0) {
      setState('none');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('worker_set_trades', { p_categories: picked });
    setBusy(false);
    if (error) {
      setState('error');
      setMessage(error.message);
      return;
    }
    const list = Array.isArray(data) ? (data as string[]) : picked;
    setSaved(list);
    setPicked(list);
    setState('saved');
    onSaved?.(list);
  };

  const body = (
    <>
      <BiText id="trades.title" variant="title" tone="strong" style={styles.title} />
      <BiText id="trades.hint" variant="bodySm" tone="muted" style={styles.hint} />
      <View style={styles.grid}>
        {categories.map((c) => {
          const on = picked.includes(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => toggle(c.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Image source={c.icon} style={styles.icon} resizeMode="contain" />
              <Text style={[typography.label, on ? styles.textOn : styles.text]}>{c.en}</Text>
            </Pressable>
          );
        })}
      </View>
      {state === 'none' ? <Banner id="trades.atLeastOne" tone="warning" /> : null}
      {state === 'error' && message ? <Banner text={message} tone="warning" /> : null}
      {state === 'saved' ? <Banner id="trades.saved" tone="success" /> : null}
      <Button
        labelId="trades.save"
        onPress={save}
        variant="secondary"
        iconLeft="check"
        loading={busy}
        disabled={busy || !changed}
        fullWidth
        style={styles.save}
      />
    </>
  );

  return bare ? <View>{body}</View> : <Card padding="lg">{body}</Card>;
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xs },
  hint: { marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  icon: { width: 18, height: 18 },
  text: { color: colors.textBody },
  textOn: { color: colors.primaryInk },
  save: { marginTop: spacing.md },
});
