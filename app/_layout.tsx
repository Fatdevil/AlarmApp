import * as Notifications from 'expo-notifications';
import {
  DarkTheme,
  DefaultTheme,
  ErrorBoundaryProps,
  router,
  Stack,
  ThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { Alert, AppState, ScrollView, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Button } from '../src/components/ui';
import { SnackbarProvider } from '../src/components/UndoSnackbar';
import {
  handleNotificationReceived,
  handleNotificationResponse,
  initializeApp,
} from '../src/services/appLifecycle';
import { refreshAlarms } from '../src/state/useAlarms';
import { spacing, typography, useTheme } from '../src/theme';

// Samma svar kan levereras både via getLastNotificationResponse och lyssnaren vid kallstart
const handledResponses = new Set<string>();

async function routeFromResponse(response: Notifications.NotificationResponse): Promise<void> {
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  if (handledResponses.has(key)) return;
  handledResponses.add(key);

  const outcome = await handleNotificationResponse(response);
  Notifications.clearLastNotificationResponse();
  if (outcome.error) Alert.alert('Kunde inte utföra åtgärden', outcome.error);
  if (outcome.focusAlarmId) {
    router.navigate({ pathname: '/', params: { focus: outcome.focusAlarmId } });
  }
}

export default function RootLayout() {
  const theme = useTheme();

  const navTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accentText,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.textPrimary,
        border: theme.colors.border,
      },
    };
  }, [theme]);

  useEffect(() => {
    initializeApp().finally(refreshAlarms);

    // Appen startades via ett tryck på en notis
    const last = Notifications.getLastNotificationResponse();
    if (last) routeFromResponse(last);

    const responseSub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    const receivedSub = Notifications.addNotificationReceivedListener(handleNotificationReceived);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAlarms();
    });

    return () => {
      responseSub.remove();
      receivedSub.remove();
      appStateSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <SnackbarProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background } }}>
            <Stack.Screen
              name="index"
              options={{ title: 'Larm', headerLargeTitle: true, headerShadowVisible: false }}
            />
            <Stack.Screen name="new" options={{ title: 'Nytt larm', presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ title: 'Inställningar' }} />
            <Stack.Screen name="diagnostics" options={{ title: 'Diagnostik' }} />
          </Stack>
        </SnackbarProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Visas om en skärm kraschar vid rendering. Larmen i databasen och OS påverkas inte. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}
    >
      <Text accessibilityRole="header" style={[typography.title, { color: colors.textPrimary }]}>
        Något gick fel
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary }]}>
        Vyn kunde inte visas. Dina larm är sparade och ringer som vanligt.
      </Text>
      {__DEV__ && (
        <Text style={[typography.footnote, { color: colors.danger }]}>{error.message}</Text>
      )}
      <Button title="Försök igen" icon="refresh" onPress={retry} />
    </ScrollView>
  );
}
