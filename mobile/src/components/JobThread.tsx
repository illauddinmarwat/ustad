import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { looksLikeContact, type ThreadMessage } from '../lib/jobPosting';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

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

/** Pre-assignment conversation between one worker and the poster. Contact details are blocked. */
export function JobThread({ jobId, workerId, token, viewer }: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'contact' | null>(null);

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

  return (
    <View style={styles.wrap}>
      {messages.length === 0 ? (
        <BiText id="thread.empty" variant="bodySm" tone="muted" style={styles.gap} />
      ) : (
        messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.sender_role === viewer ? styles.mine : styles.theirs]}>
            <Text style={styles.text}>{m.body}</Text>
          </View>
        ))
      )}
      {notice ? <Banner id="thread.noContact" tone="warning" /> : null}
      {error ? <Banner text={error} tone="warning" /> : null}
      <Input labelId="thread.placeholder" value={body} onChangeText={setBody} multiline />
      <Button labelId="thread.send" onPress={send} iconLeft="send" size="sm" hideUrdu disabled={!body.trim()} />
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
});
