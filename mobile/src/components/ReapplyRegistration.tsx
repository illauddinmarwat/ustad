import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfessionalRegistrationForm, type ReapplyData } from '../screens/auth/RegisterProfessionalScreen';
import { useT } from '../i18n/useT';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { Icon } from './ui/Icon';

type Props = { userId: string; onSubmitted: () => void; onClose: () => void };

/** Loads a rejected Ustad's saved application and shows the registration form pre-filled with it. */
export function ReapplyRegistration({ userId, onSubmitted, onClose }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ReapplyData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase.rpc('worker_get_own_application');
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (cancelled) return;
      if (error || !row) {
        setFailed(true);
        return;
      }
      // The CNIC bucket is private, so the saved images are shown through short-lived links.
      const signed = async (path: string | null) => {
        if (!path) return null;
        const { data: s } = await supabase.storage.from('worker-documents').createSignedUrl(path, 3600);
        return s?.signedUrl ?? null;
      };
      const [front, back] = await Promise.all([signed(row.cnic_front_url), signed(row.cnic_back_url)]);
      if (cancelled) return;
      setData({
        userId,
        displayName: row.display_name ?? '',
        phone: row.phone ?? '',
        city: row.city,
        area: row.area,
        address: row.address,
        cnic: row.cnic_number ?? '',
        skillCategory: row.skill_category,
        yearsExperience: row.years_experience,
        ratePkr: row.rate_pkr,
        rateUnit: row.rate_unit,
        workingHours: row.working_hours,
        bio: row.bio ?? '',
        photoUrl: row.photo_url,
        cnicFrontUrl: front,
        cnicBackUrl: back,
        lat: row.lat,
        lng: row.lng,
      });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {data ? (
          <ProfessionalRegistrationForm reapply={{ data, onSubmitted }} />
        ) : (
          <View style={[styles.center, { paddingTop: insets.top }]}>
            {failed ? <Banner id="approval.reapply.loadFailed" tone="warning" /> : <ActivityIndicator color={colors.primary} />}
          </View>
        )}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('approval.reapply.cancel').en}
          style={[styles.back, { top: insets.top + spacing.sm }]}
        >
          <Icon name="x" size={20} color={colors.textStrong} />
          <Text style={[typography.label, styles.backText]}>{t('approval.reapply.cancel').en}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  back: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  backText: { color: colors.textStrong },
});
