import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../src/components/ui';
import { activeAlarmCount } from '../src/services/places';
import { useAlarms } from '../src/state/useAlarms';
import { usePlaces } from '../src/state/usePlaces';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../src/theme';

export default function PlacesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const places = usePlaces();
  // Läses så att antalet larm per plats uppdateras när larm ändras
  useAlarms();

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={places}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <Text style={styles.intro}>
          Spara platser du använder ofta. Platserna finns bara på den här telefonen.
        </Text>
      }
      renderItem={({ item }) => {
        const count = activeAlarmCount(item.id);
        const usage = count === 0 ? 'Inga aktiva larm' : count === 1 ? '1 aktivt larm' : `${count} aktiva larm`;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, radie ${item.radius} meter, ${usage}`}
            accessibilityHint="Ändra platsen"
            onPress={() => router.push({ pathname: '/place-edit', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <Icon name="location" size={22} color={colors.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.radius} m · {usage}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Du har inga sparade platser än, t.ex. Hemma eller Jobbet.</Text>
        </View>
      }
      ListFooterComponent={
        <Button title="Lägg till plats" icon="add" onPress={() => router.push('/place-edit')} />
      }
    />
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm },
  intro: { ...typography.footnote, color: colors.textSecondary, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { ...typography.headline, color: colors.textPrimary },
  meta: { ...typography.footnote, color: colors.textMuted },
  empty: { paddingVertical: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
}));
