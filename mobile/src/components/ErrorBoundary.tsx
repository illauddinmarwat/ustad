import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { strings } from '../i18n/strings';
import { reportError } from '../lib/crashReporter';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Catches a render error anywhere below it and shows a recovery screen instead of a blank app.
 * Uses the strings table directly (not useT) so it still works if a provider is what crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught', error, info.componentStack);
    void reportError(error, { componentStack: info.componentStack, fatal: true });
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    const title = strings['error.boundary.title'];
    const body = strings['error.boundary.body'];
    return (
      <View style={styles.root} accessibilityRole="alert">
        <View style={styles.icon}>
          <Icon name="alert-triangle" size={28} color={colors.warningDeep} />
        </View>
        <Text style={[typography.title, styles.center]}>{title.en}</Text>
        <Text style={[urduTypography.label, styles.urdu]}>{title.ur}</Text>
        <Text style={[typography.body, styles.center, styles.gap]}>{body.en}</Text>
        <Text style={[urduTypography.body, styles.urdu]}>{body.ur}</Text>
        <Button labelId="error.boundary.retry" onPress={this.retry} size="lg" style={styles.btn} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  center: { color: colors.textStrong, textAlign: 'center' },
  urdu: { color: colors.textMuted, textAlign: 'center', writingDirection: 'rtl', marginTop: spacing.xs },
  gap: { marginTop: spacing.md },
  btn: { marginTop: spacing.xl },
});
