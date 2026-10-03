import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/tokens';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

/** Which language posts and listings are shown in, when there is a version of it. */
export function LanguageSetting() {
  const { language, setLanguage } = useAuth();
  const [failed, setFailed] = useState(false);
  const current = language ?? 'en';

  const choose = async (l: 'en' | 'ur') => {
    if (l === current) return;
    setFailed(false);
    try {
      await setLanguage(l);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Card padding="lg">
      <BiText id="account.language" variant="title" tone="strong" style={styles.title} />
      <BiText id="account.language.hint" variant="bodySm" tone="muted" style={styles.hint} />
      <View style={styles.row}>
        <Button
          labelId="language.english"
          onPress={() => choose('en')}
          variant={current === 'en' ? 'primary' : 'secondary'}
          hideUrdu
          style={styles.flex1}
        />
        <Button
          labelId="language.urdu"
          onPress={() => choose('ur')}
          variant={current === 'ur' ? 'primary' : 'secondary'}
          hideUrdu
          style={styles.flex1}
        />
      </View>
      {failed ? <Banner id="ai.error.failed" tone="warning" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xs },
  hint: { marginBottom: spacing.md, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
});
