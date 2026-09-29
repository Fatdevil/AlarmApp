import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PickedPlace, PlacePicker } from '../src/components/PlacePicker';
import { Button, Chip, SectionLabel } from '../src/components/ui';
import { DEFAULT_GEOFENCE_RADIUS_METERS, GEOFENCE_RADIUS_OPTIONS } from '../src/constants';
import { MAX_PLACE_NAME_LENGTH } from '../src/logic/places';
import { getPlace } from '../src/services/db';
import { activeAlarmCount, createPlace, removePlace, updatePlace } from '../src/services/places';
import { makeStyles, radii, spacing, typography, useTheme } from '../src/theme';

export default function PlaceEditScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [existing] = useState(() => (id ? getPlace(id) : null));

  const [name, setName] = useState(existing?.name ?? '');
  const [picked, setPicked] = useState<PickedPlace | null>(
    existing
      ? { name: 'Sparat läge', latitude: existing.latitude, longitude: existing.longitude, isCurrentPosition: false }
      : null
  );
  const [radius, setRadius] = useState<number>(existing?.radius ?? DEFAULT_GEOFENCE_RADIUS_METERS);
  const [isSaving, setIsSaving] = useState(false);

  const handlePick = (place: PickedPlace) => {
    setPicked(place);
    if (!name.trim() && !place.isCurrentPosition) setName(place.name.split(',')[0]);
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!picked) {
      Alert.alert('Välj var platsen ligger', 'Sök efter en adress eller använd din nuvarande position.');
      return;
    }
    setIsSaving(true);
    try {
      const input = { name, latitude: picked.latitude, longitude: picked.longitude, radius };
      if (existing) await updatePlace(existing.id, input);
      else createPlace(input);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (err) {
      Alert.alert('Kunde inte spara platsen', err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    const count = activeAlarmCount(existing.id);
    const message =
      count === 0
        ? 'Platsen tas bort från dina sparade platser.'
        : `${count === 1 ? '1 aktivt larm' : `${count} aktiva larm`} använder platsen. De fortsätter att fungera, men platsen går inte längre att välja för nya larm.`;
    Alert.alert(`Ta bort ${existing.name}?`, message, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          removePlace(existing.id);
          router.back();
        },
      },
    ]);
  };

  if (id && !existing) {
    return (
      <View style={[styles.screen, styles.body]}>
        <Stack.Screen options={{ title: 'Plats' }} />
        <Text style={styles.hint}>Platsen finns inte längre.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? existing.name : 'Ny plats' }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <SectionLabel>Namn</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="T.ex. Hemma, Jobbet eller Gymmet"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            maxLength={MAX_PLACE_NAME_LENGTH}
            accessibilityLabel="Namn på platsen"
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>{existing ? 'Flytta platsen' : 'Var ligger platsen?'}</SectionLabel>
          <PlacePicker value={picked} onChange={handlePick} />
        </View>

        <View style={styles.section}>
          <SectionLabel>Radie</SectionLabel>
          <View style={styles.wrap} accessibilityRole="radiogroup">
            {GEOFENCE_RADIUS_OPTIONS.map((r) => (
              <Chip key={r} label={`${r} m`} selected={radius === r} onPress={() => setRadius(r)} />
            ))}
          </View>
          {existing && (
            <Text style={styles.hint}>Aktiva larm på platsen följer med om du flyttar den eller ändrar radien.</Text>
          )}
        </View>

        {existing && (
          <Button variant="destructive" icon="trash-outline" title="Ta bort platsen" onPress={handleDelete} />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title="Spara plats" icon="checkmark" loading={isSaving} onPress={handleSave} />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    ...typography.body,
    minHeight: 50,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  hint: { ...typography.footnote, color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
}));
