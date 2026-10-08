import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Props = { children: ReactNode; style?: StyleProp<ViewStyle> };

/**
 * Keeps the screen's content above the on-screen keyboard. Android runs edge-to-edge, so the keyboard
 * overlaps the app instead of resizing it; "padding" lifts the content by exactly the part the keyboard
 * covers (and by nothing when the window already resized). Wrap a screen's root in this.
 */
export function KeyboardAvoid({ children, style }: Props) {
  // A stack header sits above this view, so the keyboard offset has to include it.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView style={[styles.flex, style]} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
