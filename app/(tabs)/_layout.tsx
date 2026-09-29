import { Link } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import React from 'react';
import { Pressable } from 'react-native';
import { Icon } from '../../src/components/ui';
import { MIN_TOUCH, useTheme } from '../../src/theme';

function SettingsButton() {
  const { colors } = useTheme();
  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Inställningar"
        hitSlop={8}
        style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
      >
        <Icon name="settings-outline" size={24} color={colors.accentText} />
      </Pressable>
    </Link>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <SettingsButton />,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        // En enda flik tills Agenda läggs till – dölj flikraden så länge
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Påminnelser',
          tabBarIcon: ({ color, size }) => <Icon name="list" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
