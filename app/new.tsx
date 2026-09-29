import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PickedPlace, PlacePicker } from '../src/components/PlacePicker';
import { Button, Chip, Icon, SectionLabel } from '../src/components/ui';
import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  GEOFENCE_RADIUS_OPTIONS,
  MAX_CONTENT_LENGTH,
} from '../src/constants';
import { suggestedTimeForDay } from '../src/logic/agenda';
import { newId } from '../src/logic/ids';
import { locationFromPlace, MAX_PLACE_NAME_LENGTH, validatePlace } from '../src/logic/places';
import {
  formatClock,
  formatCountdown,
  formatDayLabel,
  isSameDay,
  REPEAT_LABELS,
  repeatingStart,
  resolveSelection,
  TIME_PRESETS,
  TimeSelection,
} from '../src/logic/time';
import { createAlarm } from '../src/services/alarms';
import { createPlace, removePlace } from '../src/services/places';
import { usePlaces } from '../src/state/usePlaces';
import { ensurePermissions } from '../src/services/permissionFlow';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../src/theme';
import { ChecklistItem, GeofenceLocation, LocalAlarm, RepeatRule, TriggerType } from '../src/types';

export default function NewAlarmScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [content, setContent] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('TIME');

  // Tid – valet sparas, datumet räknas ut vid sparning (inte vid öppning)
  // Från agendan: förvald dag (YYYY-MM-DD) kl. 09:00
  const { date: dayParam } = useLocalSearchParams<{ date?: string }>();
  const [selection, setSelection] = useState<TimeSelection>(() => {
    const suggested = suggestedTimeForDay(dayParam);
    return suggested ? { kind: 'custom', date: suggested } : TIME_PRESETS[1].selection;
  });
  const [repeat, setRepeat] = useState<RepeatRule>('NONE');
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Plats: en sparad plats eller en ny (som kan sparas)
  const places = usePlaces();
  const [savedPlaceId, setSavedPlaceId] = useState<string | null>(null);
  const savedPlace = places.find((p) => p.id === savedPlaceId) ?? null;
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_GEOFENCE_RADIUS_METERS);
  const [saveAsPlace, setSaveAsPlace] = useState(false);
  const [placeName, setPlaceName] = useState('');

  // Checklista
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const chosen = resolveSelection(selection, now);
  // Upprepade larm börjar alltid vid nästa tillfälle av klockslaget (se repeatingStart)
  const preview = repeat === 'NONE' ? chosen : repeatingStart(chosen, repeat, now);
  const laterStartIgnored = chosen.getTime() > preview.getTime() && !isSameDay(chosen, preview);
  const isCustom = selection.kind === 'custom';

  const openCustomPicker = () => {
    const initial = resolveSelection(selection, new Date());
    if (Platform.OS === 'android') {
      // Android har ingen kombinerad datum+tid-väljare: datum först, sedan tid
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (event, date) => {
          if (event.type !== 'set' || !date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (e2, time) => {
              if (e2.type === 'set' && time) setSelection({ kind: 'custom', date: time });
            },
          });
        },
      });
    } else {
      setSelection({ kind: 'custom', date: initial });
      setShowIosPicker(true);
    }
  };

  const choosePickedPlace = (picked: PickedPlace) => {
    setPlace(picked);
    setSavedPlaceId(null);
    setPlaceName(picked.isCurrentPosition ? '' : picked.name.split(',')[0]);
  };

  const chooseSavedPlace = (id: string) => {
    setSavedPlaceId(id);
    setPlace(null);
    setSaveAsPlace(false);
  };

  const addChecklistItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setChecklist((items) => [...items, { id: newId('item'), text, done: false }]);
    setNewItem('');
  };

  const handleSave = async () => {
    if (isSaving) return;
    const text = content.trim();
    if (!text) {
      Alert.alert('Vad ska du påminnas om?', 'Skriv en kort text för larmet.');
      return;
    }
    if (triggerType !== 'TIME' && !place && !savedPlace) {
      Alert.alert('Välj en plats', 'Välj en sparad plats, sök efter en adress eller använd din position.');
      return;
    }
    const newPlaceInput =
      place && saveAsPlace
        ? { name: placeName, latitude: place.latitude, longitude: place.longitude, radius }
        : null;
    if (triggerType !== 'TIME' && newPlaceInput) {
      const error = validatePlace(newPlaceInput, places);
      if (error) {
        Alert.alert('Platsen kan inte sparas', error);
        return;
      }
    }

    setIsSaving(true);
    // En plats som sparas här tas bort igen om larmet inte kan skapas
    let createdPlaceId: string | null = null;
    try {
      if (!(await ensurePermissions(triggerType))) return;

      const saveNow = new Date();
      let dateTime: string | null = null;
      let location: GeofenceLocation | null = null;

      if (triggerType === 'TIME') {
        const chosen = resolveSelection(selection, saveNow);
        if (repeat === 'NONE' && chosen.getTime() <= saveNow.getTime()) {
          Alert.alert('Tiden har passerat', 'Välj en tid i framtiden.');
          return;
        }
        const date = repeat === 'NONE' ? chosen : repeatingStart(chosen, repeat, saveNow);
        dateTime = date.toISOString();
      } else if (savedPlace) {
        location = locationFromPlace(savedPlace);
      } else if (newPlaceInput) {
        // Sparas som plats först, så att larmet delar zon med framtida larm på platsen
        const created = createPlace(newPlaceInput);
        createdPlaceId = created.id;
        location = locationFromPlace(created);
      } else {
        location = {
          id: newId('loc'),
          name: place!.name,
          latitude: place!.latitude,
          longitude: place!.longitude,
          radius,
        };
      }

      const alarm: LocalAlarm = {
        id: newId('alarm'),
        creatorId: 'ME',
        recipientId: 'ME',
        content: text,
        checklistItems: checklist.length ? checklist : undefined,
        triggerType,
        dateTime,
        repeat: triggerType === 'TIME' ? repeat : 'NONE',
        location,
        status: triggerType === 'TIME' ? 'SCHEDULED' : 'ACTIVE_GEOFENCE',
        createdAt: saveNow.toISOString(),
      };

      await createAlarm(alarm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (err) {
      if (createdPlaceId) {
        try {
          removePlace(createdPlaceId);
        } catch (cleanupErr) {
          console.warn('[NewAlarm] Kunde inte ta bort platsen:', cleanupErr);
        }
      }
      Alert.alert('Kunde inte skapa larmet', err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const triggerOptions: { type: TriggerType; label: string; icon: 'alarm-outline' | 'enter-outline' | 'exit-outline' }[] = [
    { type: 'TIME', label: 'Tid', icon: 'alarm-outline' },
    { type: 'ENTER_LOCATION', label: 'Kommer till', icon: 'enter-outline' },
    { type: 'EXIT_LOCATION', label: 'Lämnar', icon: 'exit-outline' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              hitSlop={8}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>Avbryt</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.section}>
          <SectionLabel>Vad vill du bli påmind om?</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="T.ex. Köp havremjölk och kaffe"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            maxLength={MAX_CONTENT_LENGTH}
            accessibilityLabel="Larmtext"
            returnKeyType="done"
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Checklista (valfritt)</SectionLabel>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checkRow}>
              <Icon name="ellipse-outline" size={16} color={colors.textMuted} />
              <Text style={styles.checkText}>{item.text}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ta bort ${item.text}`}
                onPress={() => setChecklist((items) => items.filter((i) => i.id !== item.id))}
                style={styles.iconButton}
              >
                <Icon name="close-circle" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Lägg till punkt"
              placeholderTextColor={colors.textMuted}
              value={newItem}
              onChangeText={setNewItem}
              onSubmitEditing={addChecklistItem}
              submitBehavior="submit"
              returnKeyType="next"
              accessibilityLabel="Ny checklistepunkt"
            />
            <Button compact variant="secondary" title="Lägg till" onPress={addChecklistItem} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>När ska det ringa?</SectionLabel>
          <View style={styles.segmented} accessibilityRole="radiogroup">
            {triggerOptions.map((opt) => {
              const selected = triggerType === opt.type;
              return (
                <Pressable
                  key={opt.type}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={opt.label}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTriggerType(opt.type);
                  }}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Icon name={opt.icon} size={18} color={selected ? colors.onAccent : colors.textSecondary} />
                  <Text style={[styles.segmentText, selected && { color: colors.onAccent }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {triggerType === 'TIME' ? (
          <>
            <View style={styles.previewBox} accessible accessibilityLiveRegion="polite">
              <Text style={styles.previewClock}>{formatClock(preview)}</Text>
              <Text style={styles.previewText}>
                {formatDayLabel(preview, now)} · {formatCountdown(preview, now)}
              </Text>
            </View>

            <View style={[styles.section, styles.wrap]} accessibilityRole="radiogroup">
              {TIME_PRESETS.map((p) => (
                <Chip
                  key={p.label}
                  label={p.label}
                  selected={JSON.stringify(p.selection) === JSON.stringify(selection)}
                  onPress={() => {
                    setShowIosPicker(false);
                    setSelection(p.selection);
                  }}
                />
              ))}
              <Chip label="Välj tid…" icon="calendar-outline" selected={isCustom} onPress={openCustomPicker} />
            </View>

            {Platform.OS === 'ios' && showIosPicker && isCustom && (
              <DateTimePicker
                value={selection.date}
                mode="datetime"
                display="spinner"
                minimumDate={repeat === 'NONE' ? new Date() : undefined}
                locale="sv-SE"
                themeVariant={theme.dark ? 'dark' : 'light'}
                onChange={(_, date) => date && setSelection({ kind: 'custom', date })}
              />
            )}

            <View style={styles.section}>
              <SectionLabel>Upprepa</SectionLabel>
              <View style={styles.wrap} accessibilityRole="radiogroup">
                {(Object.keys(REPEAT_LABELS) as RepeatRule[]).map((r) => (
                  <Chip key={r} label={REPEAT_LABELS[r]} selected={repeat === r} onPress={() => setRepeat(r)} />
                ))}
              </View>
              {repeat !== 'NONE' && (
                <Text style={styles.hint}>
                  Ringer {repeat === 'DAILY' ? 'varje dag' : 'måndag–fredag'} kl. {formatClock(preview)},
                  första gången {formatDayLabel(preview, now).toLowerCase()}.
                  {laterStartIgnored ? ' Upprepningar kan ännu inte börja ett senare datum.' : ''}
                </Text>
              )}
            </View>
          </>
        ) : (
          <>
            {places.length > 0 && (
              <View style={styles.section}>
                <SectionLabel>Mina platser</SectionLabel>
                <View style={styles.wrap} accessibilityRole="radiogroup">
                  {places.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      icon="location-outline"
                      selected={savedPlaceId === p.id}
                      onPress={() => chooseSavedPlace(p.id)}
                    />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <SectionLabel>{places.length > 0 ? 'Annan plats' : 'Plats'}</SectionLabel>
              <PlacePicker value={place} onChange={choosePickedPlace} />
              {place?.isCurrentPosition && triggerType === 'ENTER_LOCATION' && (
                <Text style={[styles.hint, { color: colors.warning }]}>
                  Du är redan på platsen. Larmet ringer först när du har lämnat den och kommer tillbaka.
                </Text>
              )}
              {place && (
                <>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: saveAsPlace }}
                    onPress={() => setSaveAsPlace((v) => !v)}
                    style={styles.checkRow}
                  >
                    <Icon
                      name={saveAsPlace ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={saveAsPlace ? colors.accentText : colors.textMuted}
                    />
                    <Text style={styles.checkText}>Spara som plats</Text>
                  </Pressable>
                  {saveAsPlace && (
                    <TextInput
                      style={styles.input}
                      placeholder="Namn, t.ex. Hemma eller Gymmet"
                      placeholderTextColor={colors.textMuted}
                      value={placeName}
                      onChangeText={setPlaceName}
                      maxLength={MAX_PLACE_NAME_LENGTH}
                      accessibilityLabel="Namn på platsen"
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.section}>
              <SectionLabel>Radie</SectionLabel>
              {savedPlace ? (
                <Text style={styles.hint}>
                  {savedPlace.radius} m – ändras under Inställningar → Mina platser.
                </Text>
              ) : (
                <>
                  <View style={styles.wrap} accessibilityRole="radiogroup">
                    {GEOFENCE_RADIUS_OPTIONS.map((r) => (
                      <Chip key={r} label={`${r} m`} selected={radius === r} onPress={() => setRadius(r)} />
                    ))}
                  </View>
                  <Text style={styles.hint}>
                    Större radie ger säkrare utlösning. Under 100 m blir det opålitligt.
                  </Text>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title="Spara larm" icon="checkmark" loading={isSaving} onPress={handleSave} />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
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
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  checkText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  iconButton: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { ...typography.footnote, fontWeight: '700', color: colors.textSecondary },
  previewBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewClock: { fontSize: 44, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  previewText: { ...typography.callout, color: colors.textSecondary },
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
