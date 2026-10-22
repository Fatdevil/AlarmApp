/**
 * Rund knapp till Inställningar (Mina platser, behörigheter) i flikarnas rubrik.
 */
import { Link } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';
import { makeStyles, MIN_TOUCH, useTheme } from '../theme';
import { Icon } from './ui';

export function SettingsButton() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel="Inställningar" hitSlop={4} style={styles.button}>
        <Icon name="settings-outline" size={22} color={colors.textSecondary} />
      </Pressable>
    </Link>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  button: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
