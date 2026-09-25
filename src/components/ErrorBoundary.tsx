import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from './SafeAreaView';
import { colors, radii, spacing } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Fångade ett renderingsfel:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.iconCircle}>
              <Text style={styles.icon}>🛡️</Text>
            </View>
            <Text style={styles.title}>Ett problem uppstod</Text>
            <Text style={styles.subtitle}>
              Appen stötte på ett oväntat fel under rendering. Dina sparade larm finns säkra i lokal databas.
            </Text>

            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {this.state.error?.message || 'Okänt fel'}
              </Text>
              {this.state.error?.stack && (
                <Text style={styles.stackText} numberOfLines={8}>
                  {this.state.error.stack}
                </Text>
              )}
            </View>

            <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
              <Text style={styles.buttonText}>🔄 Ladda om vyn</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    color: colors.dangerCoral,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  stackText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 15,
  },
  button: {
    backgroundColor: colors.accentCobalt,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
