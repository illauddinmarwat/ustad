import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n/useT';
import { localized, type I18n } from '../lib/i18nText';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

type Props = {
  /** The author's original text. */
  original: string | null | undefined;
  /** The English and Urdu versions the author approved, when there are any. */
  i18n?: I18n;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Cards: show the reader's language without the "Show original" link. */
  compact?: boolean;
};

/** Text in the reader's language, with a way back to the original. Falls back to the original. */
export function LocalizedText({ original, i18n, style, numberOfLines, compact }: Props) {
  const { language } = useAuth();
  const { t } = useT();
  const [showOriginal, setShowOriginal] = useState(false);
  const l = localized(original, i18n, language ?? 'en');
  const shown = showOriginal ? l.original : l.text;
  const rtl = /[؀-ۿ]/.test(shown);

  return (
    <View>
      <Text style={[style, rtl && styles.rtl]} numberOfLines={numberOfLines}>
        {shown}
      </Text>
      {l.translated && !compact ? (
        <Pressable onPress={() => setShowOriginal((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>
            {showOriginal ? t('localized.showTranslation').en : t('localized.showOriginal').en}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  link: { ...typography.caption, color: colors.primary, marginTop: spacing.xs },
});
