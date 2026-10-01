import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { looksLikeContact, type ThreadMessage } from '../lib/jobPosting';
import { fetchQuoteUpgradesEnabled } from '../lib/quoteDetails';
import { QUOTE_VOICE_SECONDS, sendThreadVoice } from '../lib/quoteVoice';
import { supabase } from '../lib/supabase';
import type { VoiceNote } from '../lib/voiceNote';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { SignedVoicePlayer } from './SignedVoicePlayer';
import { VoiceRecorder } from './VoiceRecorder';
import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type Props = {
  jobId: string;
  /** The worker this conversation is with. */
  workerId: string;
  /** Guest access token (poster without an account). */
  token?: string | null;
  /** Which side is looking: decides which bubbles are "mine". */
  viewer: 'customer' | 'worker';
};

/**
 * Pre-assignment conversation between one worker and the poster. Contact details are blocked in text. Signed-in
 * people can also send and hear voice notes of up to 30 seconds; a guest poster has no account, so text only.
 */
export function JobThread({ jobId, workerId, token, viewer }: Props) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'contact' | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('list_thread', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_token: token ?? null,
    });
    setMessages((data ?? []) as ThreadMessage[]);
  }, [jobId, workerId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchQuoteUpgradesEnabled().then(setVoiceEnabled);
  }, []);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setError(null);
    if (looksLikeContact(text)) {
      setNotice('contact');
      return;
    }
    setNotice(null);
    const { error: rpcError } = await supabase.rpc('post_thread_message', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_body: text,
      p_token: token ?? null,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setBody('');
    await load();
  };

  const sendVoice = async () => {
    if (!voice || !uid) return;
    setVoiceBusy(true);
    setVoiceFailed(false);
    setError(null);
    const message = await sendThreadVoice(uid, jobId, workerId, voice);
    setVoiceBusy(false);
    if (message) {
      setVoiceFailed(true);
      setError(message);
      return;
    }
    setVoice(null);
    await load();
  };

  return (
    <View style={styles.wrap}>
      {messages.length === 0 ? (
        <BiText id="thread.empty" variant="bodySm" tone="muted" style={styles.gap} />
      ) : (
        messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.sender_role === viewer ? styles.mine : styles.theirs]}>
            {m.body ? <Text style={styles.text}>{m.body}</Text> : null}
            {m.audio_path && uid ? <SignedVoicePlayer path={m.audio_path} seconds={m.audio_seconds} /> : null}
            {m.audio_path && !uid ? <BiText id="quote.hasVoice" variant="caption" tone="muted" /> : null}
          </View>
        ))
      )}
      {notice ? <Banner id="thread.noContact" tone="warning" /> : null}
      {error ? <Banner text={error} tone="warning" /> : null}
      <Input labelId="thread.placeholder" value={body} onChangeText={setBody} multiline />
      <Button labelId="thread.send" onPress={send} iconLeft="send" size="sm" hideUrdu disabled={!body.trim()} />

      {voiceEnabled && uid && !token ? (
        <View style={styles.voice}>
          <VoiceRecorder value={voice} onChange={setVoice} maxSeconds={QUOTE_VOICE_SECONDS} hintId="quote.voiceHint" />
          {voice ? (
            <Button labelId="thread.sendVoice" onPress={sendVoice} iconLeft="send" size="sm" hideUrdu disabled={voiceBusy} loading={voiceBusy} />
          ) : null}
          {voiceFailed ? <Banner id="thread.voiceFailed" tone="warning" /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: spacing.sm },
  gap: { marginBottom: spacing.xs },
  bubble: { maxWidth: '85%', padding: spacing.sm, borderRadius: radius.md },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  text: { ...typography.body, color: colors.textStrong },
  voice: { marginTop: spacing.sm },
});
