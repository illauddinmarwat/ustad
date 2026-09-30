import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebView as WebViewType, WebViewMessageEvent } from 'react-native-webview';

import { useT } from '../i18n/useT';
import { buildMapHtml } from '../lib/mapHtml';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

export type PinnedLocation = { lat: number; lng: number };

type Props = {
  visible: boolean;
  initial: PinnedLocation | null;
  onConfirm: (loc: PinnedLocation) => void;
  onClose: () => void;
};

// The native WebView module does not exist on web, where an iframe is used instead.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView: typeof WebViewType | null = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

// Centre of Pakistan, zoomed out, when we know nothing about the user yet.
const DEFAULT: PinnedLocation = { lat: 30.3753, lng: 69.3451 };

/** Map with a draggable pin (OpenStreetMap via Leaflet — free, no API key). */
export function LocationPickerModal({ visible, initial, onConfirm, onClose }: Props) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState<PinnedLocation | null>(initial);
  const [denied, setDenied] = useState(false);
  const [start, setStart] = useState<PinnedLocation | null>(null);
  const webRef = useRef<WebViewType>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Decide the starting point once each time the picker opens.
  useEffect(() => {
    if (!visible) return;
    setDenied(false);
    setPin(initial);
    if (initial) {
      setStart(initial);
      return;
    }
    setStart(null);
    let live = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) throw new Error('denied');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (live) setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        if (live) {
          setDenied(true);
          setStart(DEFAULT);
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const html = useMemo(
    () => (start ? buildMapHtml(start.lat, start.lng, start === DEFAULT ? 5 : 16) : ''),
    [start]
  );

  // Web has no WebView: the iframe posts the pin back to the window.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handler = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      try {
        const d = JSON.parse(e.data) as PinnedLocation;
        if (typeof d.lat === 'number' && typeof d.lng === 'number') setPin({ lat: d.lat, lng: d.lng });
      } catch {
        // not ours
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [visible]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const d = JSON.parse(e.nativeEvent.data) as PinnedLocation;
      setPin({ lat: d.lat, lng: d.lng });
    } catch {
      // ignore
    }
  };

  const useMyLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const msg = JSON.stringify({ move: true, lat: pos.coords.latitude, lng: pos.coords.longitude });
      if (Platform.OS === 'web') frameRef.current?.contentWindow?.postMessage(msg, '*');
      else webRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(msg)}}));true;`);
    } catch {
      setDenied(true);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Text style={[typography.title, styles.title]}>{t('map.title').en}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Icon name="x" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={[typography.bodySm, styles.hint]}>{t(denied ? 'map.denied' : 'map.hint').en}</Text>

        <View style={styles.mapWrap}>
          {start ? (
            Platform.OS === 'web' ? (
              React.createElement('iframe', {
                ref: frameRef,
                srcDoc: html,
                style: { border: 0, width: '100%', height: '100%' },
              })
            ) : WebView ? (
              <WebView
                ref={webRef}
                originWhitelist={['*']}
                source={{ html, baseUrl: 'https://ustad.app' }}
                onMessage={onMessage}
                javaScriptEnabled
                domStorageEnabled
                style={styles.map}
              />
            ) : null
          ) : (
            <Text style={[typography.bodySm, styles.hint]}>…</Text>
          )}
        </View>

        <Button labelId="map.myLocation" onPress={useMyLocation} variant="secondary" fullWidth style={styles.gap} />
        <Button
          labelId="map.confirm"
          onPress={() => pin && onConfirm(pin)}
          disabled={!pin}
          variant="success"
          size="lg"
          fullWidth
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  title: { flex: 1, color: colors.textStrong },
  hint: { color: colors.textMuted, marginBottom: spacing.sm },
  mapWrap: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { flex: 1, width: '100%' },
  gap: { marginBottom: spacing.sm },
});
