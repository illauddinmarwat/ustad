import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../i18n/strings';
import { contactVisible, validateContact, type ContactErrors, type JobContacts } from '../lib/jobPayments';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Input } from './ui/Input';

type Props = {
  jobId: string;
  status: string;
  isCustomer: boolean;
  isWorker: boolean;
  /** Called after the customer saves contact details, so the parent can refresh. */
  onChanged?: () => void;
};

/**
 * Phone and address appear only after a worker has accepted (server-enforced by
 * `get_job_contacts` / `customer_set_job_contact`). Before that this renders nothing.
 */
export function JobContactSection({ jobId, status, isCustomer, isWorker, onChanged }: Props) {
  const [contacts, setContacts] = useState<JobContacts | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [msg, setMsg] = useState<{ id?: StringId; text?: string } | null>(null);
  const visible = contactVisible(status);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_job_contacts', { p_job_id: jobId });
    const row = (Array.isArray(data) ? data[0] : data) as JobContacts | null | undefined;
    setContacts(row ?? null);
    setLoaded(true);
  }, [jobId]);

  useEffect(() => {
    if (!visible || !(isCustomer || isWorker)) return;
    load().catch(() => setLoaded(true));
  }, [visible, isCustomer, isWorker, load, status]);

  useEffect(() => {
    if (!isCustomer || !visible) return;
    supabase.rpc('get_my_contact_defaults').then(({ data }) => {
      const row = (Array.isArray(data) ? data[0] : data) as { phone?: string | null; address?: string | null } | null;
      if (row?.phone) setPhone((p) => p || row.phone!);
      if (row?.address) setAddress((a) => a || row.address!);
    });
  }, [isCustomer, visible]);

  if (!visible || !(isCustomer || isWorker) || !loaded) return null;

  const save = async () => {
    const result = validateContact({ phone, address });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const { error } = await supabase.rpc('customer_set_job_contact', {
      p_job_id: jobId,
      p_phone: result.phone,
      p_address: result.address,
    });
    if (error) {
      setMsg({ text: error.message });
      return;
    }
    setMsg({ id: 'contact.saved' });
    await load();
    onChanged?.();
  };

  const call = (number: string | null | undefined) => {
    if (number) Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const shared = !!contacts?.contact_shared;

  return (
    <Card padding="lg">
      <BiText id="contact.title" variant="title" tone="strong" style={styles.title} />

      {isCustomer && (
        <>
          {contacts?.worker_phone ? (
            <View style={styles.row}>
              <Icon name="phone" size={16} color={colors.primary} />
              <Text style={styles.value}>{contacts.worker_phone}</Text>
              <Button
                labelId="contact.callWorker"
                onPress={() => call(contacts.worker_phone)}
                variant="secondary"
                iconLeft="phone"
                size="sm"
                hideUrdu
              />
            </View>
          ) : (
            <BiText id="contact.workerNoPhone" variant="bodySm" tone="muted" style={styles.gap} />
          )}

          {!shared && (
            <>
              <BiText id="contact.customerPrompt" variant="bodySm" tone="muted" style={styles.gap} />
              <Input
                labelId="contact.field.phone"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                iconLeft="phone"
                error={errors.phone}
              />
              <Input
                labelId="contact.field.address"
                value={address}
                onChangeText={setAddress}
                multiline
                iconLeft="map-pin"
                error={errors.address}
              />
              <Button labelId="contact.save" onPress={save} iconLeft="check" fullWidth />
            </>
          )}
          {shared && <BiText id="contact.sharedWithWorker" variant="bodySm" tone="muted" />}
        </>
      )}

      {isWorker && (
        <>
          {shared ? (
            <>
              <View style={styles.row}>
                <Icon name="phone" size={16} color={colors.primary} />
                <Text style={styles.value}>{contacts?.customer_phone}</Text>
                <Button
                  labelId="contact.callCustomer"
                  onPress={() => call(contacts?.customer_phone)}
                  variant="secondary"
                  iconLeft="phone"
                  size="sm"
                  hideUrdu
                />
              </View>
              <View style={styles.row}>
                <Icon name="map-pin" size={16} color={colors.primary} />
                <Text style={styles.value}>{contacts?.customer_address}</Text>
              </View>
            </>
          ) : (
            <BiText id="contact.waitingCustomer" variant="bodySm" tone="muted" />
          )}
        </>
      )}

      {msg ? msg.id ? <Banner id={msg.id} tone="success" /> : <Banner text={msg.text} tone="warning" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  gap: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  value: { ...typography.body, color: colors.textStrong, flex: 1 },
});
