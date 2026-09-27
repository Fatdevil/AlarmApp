import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, SectionLabel } from '../src/components/ui';
import {
  ALL_DAYS,
  buildSeriesTimes,
  dayLetter,
  dayShort,
  describeDays,
  formatHM,
  WEEK_ORDER,
  WEEKEND,
  WORK_DAYS,
} from '../src/logic/wake';
import { getWakeAlarm, getWakeAlarms } from '../src/services/db';
import { ensurePermissions } from '../src/services/permissionFlow';
import { createWakeAlarms, removeWakeAlarms, updateWakeAlarm } from '../src/services/wake';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../src/theme';

const SERIES_COUNTS = [3, 4, 5, 6, 8, 10];
const SERIES_INTERVALS = [5, 10, 15];

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export default function WakeEditScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [existing] = useState(() => (id ? getWakeAlarm(id) : null));
  const isEdit = !!existing;

  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setHours(existing?.hour ?? 7, existing?.minute ?? 0, 0, 0);
    return d;
  });
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? WORK_DAYS);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [seriesOn, setSeriesOn] = useState(false);
  const [count, setCount] = useState(5);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [isSaving, setIsSaving] = useState(false);

  const hour = time.getHours();
  const minute = time.getMinutes();
  const seriesTimes = buildSeriesTimes(hour, minute, count, intervalMinutes);

  const toggleDay = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  };

  const openAndroidTime = () =>
    DateTimePickerAndroid.open({
      value: time,
      mode: 'time',
      is24Hour: true,
      onChange: (e, d) => {
        if (e.type === 'set' && d) setTime(d);
      },
    });

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!(await ensurePermissions('TIME'))) return;
      const input = { hour, minute, label, weekdays };
      if (existing) {
        await updateWakeAlarm(existing.id, input);
      } else {
        await createWakeAlarms(input, seriesOn ? { count, intervalMinutes } : undefined);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (err) {
      Alert.alert('Kunde inte spara', err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (ids: string[]) =>
    removeWakeAlarms(ids)
      .then(() => router.back())
      .catch((err) => Alert.alert('Kunde inte radera', String(err)));

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: isEdit ? 'Ändra väckning' : 'Ny väckning',
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Avbryt</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={time}
            mode="time"
            display="spinner"
            locale="sv-SE"
            themeVariant={theme.dark ? 'dark' : 'light'}
            onChange={(_, d) => d && setTime(d)}
            style={{ alignSelf: 'stretch' }}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tid ${formatHM(hour, minute)}. Tryck för att ändra.`}
            onPress={openAndroidTime}
            style={styles.timeBox}
          >
            <Text style={styles.bigTime}>{formatHM(hour, minute)}</Text>
            <Text style={styles.hint}>Tryck för att ändra</Text>
          </Pressable>
        )}

        <View style={styles.section}>
          <SectionLabel>Upprepa</SectionLabel>
          <View style={styles.days} accessibilityRole="none">
            {WEEK_ORDER.map((day) => {
              const on = weekdays.includes(day);
              return (
                <Pressable
                  key={day}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={dayShort(day)}
                  onPress={() => toggleDay(day)}
                  style={[styles.day, on && styles.dayOn]}
                >
                  <Text style={[styles.dayText, on && { color: colors.onAccent }]}>{dayLetter(day)}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.wrap}>
            <Chip label="Vardagar" selected={sameSet(weekdays, WORK_DAYS)} onPress={() => setWeekdays(WORK_DAYS)} />
            <Chip label="Varje dag" selected={sameSet(weekdays, ALL_DAYS)} onPress={() => setWeekdays(ALL_DAYS)} />
            <Chip label="Helger" selected={sameSet(weekdays, WEEKEND)} onPress={() => setWeekdays(WEEKEND)} />
            <Chip label="En gång" selected={weekdays.length === 0} onPress={() => setWeekdays([])} />
          </View>
          <Text style={styles.hint}>{describeDays(weekdays)}</Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>Etikett</SectionLabel>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="T.ex. Jobb, Träning"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            style={styles.input}
            accessibilityLabel="Etikett"
          />
        </View>

        {!isEdit && (
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Väckningsserie</Text>
                <Text style={styles.hint}>
                  Flera larm i rad. Tryck &quot;Jag är vaken&quot; så stängs resten av.
                </Text>
              </View>
              <Switch
                value={seriesOn}
                onValueChange={setSeriesOn}
                trackColor={{ true: colors.accent, false: colors.surfaceHighlight }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Väckningsserie"
              />
            </View>
            {seriesOn && (
              <>
                <SectionLabel>Antal larm</SectionLabel>
                <View style={styles.wrap}>
                  {SERIES_COUNTS.map((n) => (
                    <Chip key={n} label={String(n)} selected={count === n} onPress={() => setCount(n)} />
                  ))}
                </View>
                <SectionLabel>Mellanrum</SectionLabel>
                <View style={styles.wrap}>
                  {SERIES_INTERVALS.map((m) => (
                    <Chip key={m} label={`${m} min`} selected={intervalMinutes === m} onPress={() => setIntervalMinutes(m)} />
                  ))}
                </View>
                <Text style={styles.hint} accessibilityLiveRegion="polite">
                  {seriesTimes.map((t) => formatHM(t.hour, t.minute)).join(', ')}
                </Text>
              </>
            )}
          </View>
        )}

        {existing && (
          <View style={styles.section}>
            <Button
              variant="destructive"
              icon="trash-outline"
              title="Radera väckningen"
              onPress={() => handleDelete([existing.id])}
            />
            {existing.seriesId && (
              <Button
                variant="ghost"
                title="Radera hela serien"
                onPress={() =>
                  Alert.alert('Radera hela serien?', 'Alla larm i serien tas bort.', [
                    { text: 'Avbryt', style: 'cancel' },
                    {
                      text: 'Radera',
                      style: 'destructive',
                      onPress: () =>
                        handleDelete(
                          getWakeAlarms()
                            .filter((a) => a.seriesId === existing.seriesId)
                            .map((a) => a.id)
                        ),
                    },
                  ])
                }
              />
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          title={isEdit ? 'Spara' : seriesOn ? `Skapa ${count} larm` : 'Spara väckning'}
          icon="checkmark"
          loading={isSaving}
          onPress={handleSave}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bigTime: { fontSize: 64, fontWeight: '300', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dayOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayText: { ...typography.callout, fontWeight: '700', color: colors.textPrimary },
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { ...typography.headline, color: colors.textPrimary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hint: { ...typography.footnote, color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  headerButton: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  headerButtonText: { ...typography.callout, color: colors.accentText },
}));
