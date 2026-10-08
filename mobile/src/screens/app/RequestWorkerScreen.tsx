import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCityAreaFields } from '../../components/CityAreaFields';
import { PhotoAttach } from '../../components/PhotoAttach';
import { PlaceSection } from '../../components/PlaceSection';
import { TimeChips } from '../../components/TimeChips';
import { VideoRecorder } from '../../components/VideoRecorder';
import { VoiceRecorder } from '../../components/VoiceRecorder';
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
import { fetchJobMediaEnabled, uploadJobPhotos, uploadJobVideoClip, uploadJobVoice } from '../../lib/jobMedia';
import { fetchListingRequestsEnabled } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { useProfileCity } from '../../lib/useProfileCity';
import type { VideoClip } from '../../lib/videoNote';
import type { VoiceNote } from '../../lib/voiceNote';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { KeyboardAvoid } from '../../components/ui/KeyboardAvoid';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RequestWorker'>;

export default function RequestWorkerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'RequestWorker'>>();
  const { workerId, workerName, category, listingId } = route.params;
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [quoteMarkup, setQuoteMarkup] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const profileCity = useProfileCity(session?.user.id);
  const place = useCityAreaFields({ cityName: profileCity, areaName: null, addressDetails: null, location: null });
  const area = [place.areaName, place.addressDetails, place.cityName].filter(Boolean).join(', ').slice(0, 160);
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [listingEnabled, setListingEnabled] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [video, setVideo] = useState<VideoClip | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  useEffect(() => {
    fetchDirectRequestFlags().then((f) => {
      setEnabled(f.enabled);
      setQuoteMarkup(f.quoteMarkup === true);
    });
  fetchJobMediaEnabled().then(setMediaEnabled);
    if (listingId) fetchListingRequestsEnabled().then(setListingEnabled);
  }, [listingId]);

  const submit = async () => {
    setServerError(null);
    if (!session?.user.id) {
      navigation.navigate('Auth');
      return;
    }
    const result = validateRequestForm({ title, description, budget: quoteMarkup ? '' : budget, preferredTime });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const { data, error } = listingId
      ? await supabase.rpc('create_listing_request', {
          p_listing_id: listingId,
          p_title: result.title,
          p_description: result.description,
          p_location_text: area.trim() || null,
          p_preferred_time: result.preferredTime,
        })
      : await supabase.rpc('create_direct_request', {
          p_worker_id: workerId,
          p_title: result.title,
          p_description: result.description,
          p_category: category ?? '',
          p_budget_pkr: quoteMarkup ? null : result.budgetPkr,
          p_preferred_time: result.preferredTime,
          p_location_text: area.trim() || null,
        });
    if (error) {
      setBusy(false);
      setServerError(error.message);
      return;
    }
    void trackEvent('direct_request_created', session.user.id, {
      job_id: data,
      worker_id: workerId,
      listing_id: listingId ?? null,
      photos: photos.length,
      voice: !!voice,
      video: !!video,
    });
    if (mediaEnabled && typeof data === 'string' && (photos.length > 0 || voice || video)) {
      // The request exists already, so a failed upload never loses it.
      await Promise.all([
        photos.length > 0 ? uploadJobPhotos(session.user.id, data, photos) : null,
        voice ? uploadJobVoice(session.user.id, data, voice) : null,
        video ? uploadJobVideoClip(session.user.id, data, video, (f) => setUploadPct(Math.round(f * 100))) : null,
      ]);
      setUploadPct(null);
    }
    setBusy(false);
    navigation.navigate('Tabs', { screen: 'Applications' });
  };

  return (
    <KeyboardAvoid>
    <ScrollView
      contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        titleId={listingId ? 'request.listing.title' : 'request.title'}
        subtitleId={listingId ? 'request.listing.subtitle' : 'request.subtitle'}
      />

      {(enabled === false || (listingId && !listingEnabled)) && <Banner id="request.disabled" tone="warning" />}
      {uploadPct != null ? <Banner text={`Uploading video… ${uploadPct}%`} tone="info" /> : null}
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
        {quoteMarkup || listingId ? null : (
          <Input
            labelId="request.field.budget"
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
            iconLeft="dollar-sign"
            error={errors.budget}
          />
        )}
        <TimeChips value={preferredTime} onChange={setPreferredTime} />
        <PlaceSection summary={[place.areaName, place.cityName].filter(Boolean).join(', ')}>{place.fields}</PlaceSection>

        {mediaEnabled && session?.user.id ? (
          <>
            <PhotoAttach uris={photos} onChange={setPhotos} />
            <VoiceRecorder value={voice} onChange={setVoice} />
            <VideoRecorder value={video} onChange={setVideo} />
          </>
        ) : null}

        <Banner id="request.privacy" tone="info" icon="lock" />
        <View style={styles.submit}>
          <Button
            labelId="request.submit"
            onPress={submit}
            iconLeft="send"
            fullWidth
            disabled={busy || enabled === false || (!!listingId && !listingEnabled)}
          />
        </View>
      </Card>
    </ScrollView>
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  worker: { ...typography.subtitle, color: colors.textStrong, marginBottom: spacing.md },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  submit: { marginTop: spacing.md },
});
