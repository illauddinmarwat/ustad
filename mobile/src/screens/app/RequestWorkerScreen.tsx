import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../lib/analytics';
import {
  fetchDirectRequestFlags,
  validateRequestForm,
  type RequestFormErrors,
} from '../../lib/directRequests';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RequestWorker'>;

export default function RequestWorkerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'RequestWorker'>>();
  const { workerId, workerName, category } = route.params;
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [area, setArea] = useState('');
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchDirectRequestFlags().then((f) => setEnabled(f.enabled));
  }, []);

  const submit = async () => {
    setServerError(null);
    if (!session?.user.id) {
      navigation.navigate('Auth');
      return;
    }
    const result = validateRequestForm({ title, description, budget, preferredTime });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const { data, error } = await supabase.rpc('create_direct_request', {
      p_worker_id: workerId,
      p_title: result.title,
      p_description: result.description,
      p_category: category ?? '',
      p_budget_pkr: result.budgetPkr,
      p_preferred_time: result.preferredTime,
      p_location_text: area.trim() || null,
    });
    setBusy(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    void trackEvent('direct_request_created', session.user.id, { job_id: data, worker_id: workerId });
    navigation.navigate('Tabs', { screen: 'Applications' });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader titleId="request.title" subtitleId="request.subtitle" />

      {enabled === false && <Banner id="request.disabled" tone="warning" />}
      {!session?.user.id && <Banner id="request.signIn" tone="info" />}
      {serverError ? <Banner text={serverError} tone="warning" /> : null}

      <Card padding="lg">
        {workerName ? <Text style={styles.worker}>{workerName}</Text> : null}
        <Input
          labelId="request.field.title"
          value={title}
          onChangeText={setTitle}
          iconLeft="edit-3"
          error={errors.title}
        />
        <Input
          labelId="request.field.description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={styles.multiline}
          error={errors.description}
        />
        <Input
          labelId="request.field.budget"
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          iconLeft="dollar-sign"
          error={errors.budget}
        />
        <Input
          labelId="request.field.time"
          value={preferredTime}
          onChangeText={setPreferredTime}
          iconLeft="calendar"
        />
        <Input labelId="request.field.area" value={area} onChangeText={setArea} iconLeft="map-pin" />

        <Banner id="request.privacy" tone="info" icon="lock" />
        <View style={styles.submit}>
          <Button
            labelId="request.submit"
            onPress={submit}
            iconLeft="send"
            fullWidth
            disabled={busy || enabled === false}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  worker: { ...typography.subtitle, color: colors.textStrong, marginBottom: spacing.md },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  submit: { marginTop: spacing.md },
});
