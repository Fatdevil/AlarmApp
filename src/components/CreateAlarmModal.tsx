import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { LocalAlarm, TriggerType, ChecklistItem, GeofenceLocation } from '../types';
import { colors, spacing, radii, typography } from '../theme';
import { MIN_GEOFENCE_RADIUS_METERS, DEFAULT_GEOFENCE_RADIUS_METERS } from '../services/geofence';

interface CreateAlarmModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (alarm: LocalAlarm) => Promise<void>;
}

export const CreateAlarmModal: React.FC<CreateAlarmModalProps> = ({
  visible,
  onClose,
  onSave,
}) => {
  const [content, setContent] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('TIME');

  // Tidsinställningar – [E] alarmDate beräknas vid val, inte vid spara
  const [alarmDate, setAlarmDate] = useState<Date>(() => new Date(Date.now() + 30 * 60 * 1000));
  const [customTimeLabel, setCustomTimeLabel] = useState('Om 30 minuter');
  const [crossesMidnight, setCrossesMidnight] = useState(false); // [D]
  const [selectedPresetIdx, setSelectedPresetIdx] = useState<number>(1); // [B] default = "+30 min"

  // Platsinställningar
  const [placeName, setPlaceName] = useState('Nuvarande plats');
  const [radius, setRadius] = useState<number>(DEFAULT_GEOFENCE_RADIUS_METERS);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Checklista
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');

  // [C] Fullständig reset av hela formuläret
  const resetForm = () => {
    setContent('');
    setTriggerType('TIME');
    const defaultDate = new Date(Date.now() + 30 * 60 * 1000);
    setAlarmDate(defaultDate);
    setCustomTimeLabel('Om 30 minuter');
    setCrossesMidnight(false);
    setSelectedPresetIdx(1);
    setPlaceName('Nuvarande plats');
    setRadius(DEFAULT_GEOFENCE_RADIUS_METERS);
    setCoords(null);
    setChecklistItems([]);
    setShowChecklist(false);
    setNewItemText('');
  };

  // [A] Formatera klockslag från ett Date-objekt → "HH:MM"
  const formatClock = (date: Date): string => {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  // [D] Kontrollera om ett datum är en annan dag än idag
  const isDifferentDay = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getDate() !== today.getDate() ||
      date.getMonth() !== today.getMonth() ||
      date.getFullYear() !== today.getFullYear()
    );
  };

  // Snabba tidspresets
  const quickTimePresets = [
    { label: '+15 min', minutes: 15 },
    { label: '+30 min', minutes: 30 },
    { label: '+1 tim', minutes: 60 },
    { label: 'Ikväll (19:00)', minutes: 'TONIGHT' },
    { label: 'Imorgon (09:00)', minutes: 'TOMORROW' },
  ];

  // [B+E] Välj preset: beräkna exakt datum direkt + markera vald chip
  const handleSelectTimePreset = (preset: any, idx: number) => {
    setSelectedPresetIdx(idx);
    const now = new Date();
    let target: Date;

    if (preset.minutes === 'TONIGHT') {
      target = new Date();
      target.setHours(19, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      setCustomTimeLabel('Ikväll 19:00');
    } else if (preset.minutes === 'TOMORROW') {
      target = new Date();
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
      setCustomTimeLabel('Imorgon 09:00');
    } else {
      target = new Date(now.getTime() + preset.minutes * 60 * 1000);
      setCustomTimeLabel(`Om ${preset.minutes} min`);
    }

    setAlarmDate(target);
    // [D] Varning om preset korsar midnatt
    setCrossesMidnight(isDifferentDay(target) && preset.minutes !== 'TOMORROW' && preset.minutes !== 'TONIGHT');
  };

  // Hämta GPS för nuvarande plats
  const fetchCurrentLocation = async () => {
    try {
      setIsFetchingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Platsbehörighet', 'Appen behöver platsbehörighet för att sätta en zon här.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      setPlaceName('Min nuvarande plats');
    } catch (e: any) {
      Alert.alert('Platsfel', e.message);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  // Lägg till checklistepunkt
  const handleAddChecklistItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      text: newItemText.trim(),
      done: false,
    };
    setChecklistItems([...checklistItems, newItem]);
    setNewItemText('');
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklistItems(checklistItems.filter((i) => i.id !== id));
  };

  // Spara larm
  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert('Titel saknas', 'Ange vad du vill bli påmind om.');
      return;
    }

    try {
      const now = new Date();
      // [E] alarmDate är redan beräknad vid preset-val – använd direkt
      let alarmDateStr: string | null = null;
      let locationObj: GeofenceLocation | null = null;

      if (triggerType === 'TIME') {
        alarmDateStr = alarmDate.toISOString();
      } else {
        // Platslarm
        if (radius < MIN_GEOFENCE_RADIUS_METERS) {
          Alert.alert('Ogiltig radie', `Minsta radie är ${MIN_GEOFENCE_RADIUS_METERS} meter.`);
          return;
        }

        let finalCoords = coords;
        if (!finalCoords) {
          setIsFetchingLocation(true);
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          finalCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setIsFetchingLocation(false);
        }

        locationObj = {
          id: `loc_${Date.now()}`,
          name: placeName.trim() || 'Min plats',
          latitude: finalCoords.latitude,
          longitude: finalCoords.longitude,
          radius,
        };
      }

      const newAlarm: LocalAlarm = {
        id: `alarm_${Date.now()}`,
        creatorId: 'ME',
        recipientId: 'ME',
        content: content.trim(),
        checklistItems: checklistItems.length > 0 ? checklistItems : undefined,
        triggerType,
        dateTime: alarmDateStr,
        location: locationObj,
        status: triggerType === 'TIME' ? 'SCHEDULED' : 'ACTIVE_GEOFENCE',
        createdAt: now.toISOString(),
      };

      await onSave(newAlarm);

      // [C] Fullständig reset via resetForm
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert('Kunde inte skapa larm', e.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheetContainer}>
          {/* Dra-indikator */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.sheetTitle}>Nytt larm</Text>
            <TouchableOpacity onPress={() => { resetForm(); onClose(); }} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Vad ska göras? */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>VAD VILL DU BLI PÅMIND OM?</Text>
              <TextInput
                style={styles.mainInput}
                placeholder="T.ex. Köp havremjölk & kaffe..."
                placeholderTextColor={colors.textMuted}
                value={content}
                onChangeText={setContent}
                autoFocus
              />
            </View>

            {/* Checklista toggle */}
            {!showChecklist ? (
              <TouchableOpacity
                style={styles.addChecklistBtn}
                onPress={() => setShowChecklist(true)}
              >
                <Text style={styles.addChecklistBtnText}>+ Lägg till checklista</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.checklistSection}>
                <Text style={styles.fieldLabel}>CHECKLISTA</Text>
                {checklistItems.map((item, idx) => (
                  <View key={item.id} style={styles.checklistInputRow}>
                    <Text style={styles.checklistBullet}>•</Text>
                    <Text style={styles.checklistAddedText}>{item.text}</Text>
                    <TouchableOpacity onPress={() => handleRemoveChecklistItem(item.id)}>
                      <Text style={styles.checklistRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.checklistNewRow}>
                  <TextInput
                    style={styles.checklistInput}
                    placeholder="Lägg till punkt..."
                    placeholderTextColor={colors.textMuted}
                    value={newItemText}
                    onChangeText={setNewItemText}
                    onSubmitEditing={handleAddChecklistItem}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.checklistAddActionBtn}
                    onPress={handleAddChecklistItem}
                  >
                    <Text style={styles.checklistAddActionText}>Lägg till</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* När eller Var? */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>NÄR ELLER VAR SKA DET TRIGGAS?</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segmentBtn, triggerType === 'TIME' && styles.segmentBtnActive]}
                  onPress={() => setTriggerType('TIME')}
                >
                  <Text style={[styles.segmentText, triggerType === 'TIME' && styles.segmentTextActive]}>
                    ⏰ Tid
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentBtn, triggerType === 'ENTER_LOCATION' && styles.segmentBtnActive]}
                  onPress={() => {
                    setTriggerType('ENTER_LOCATION');
                    if (!coords) fetchCurrentLocation();
                  }}
                >
                  <Text style={[styles.segmentText, triggerType === 'ENTER_LOCATION' && styles.segmentTextActive]}>
                    📍 Kommer till
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentBtn, triggerType === 'EXIT_LOCATION' && styles.segmentBtnActive]}
                  onPress={() => {
                    setTriggerType('EXIT_LOCATION');
                    if (!coords) fetchCurrentLocation();
                  }}
                >
                  <Text style={[styles.segmentText, triggerType === 'EXIT_LOCATION' && styles.segmentTextActive]}>
                    🚗 Lämnar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Inställningar för TID */}
            {triggerType === 'TIME' && (
              <View style={styles.timeSettingsContainer}>
                {/* [A] Vald tid med exakt klockslag */}
                <View style={styles.activeTimeRow}>
                  <Text style={styles.activeTimePreview}>
                    {customTimeLabel}
                  </Text>
                  <Text style={styles.activeTimeClock}>→ {formatClock(alarmDate)}</Text>
                </View>

                {/* [D] Varning om preset korsar midnatt */}
                {crossesMidnight && (
                  <View style={styles.midnightWarning}>
                    <Text style={styles.midnightWarningText}>
                      ⚠️ Larmet slår imorgon {formatClock(alarmDate)}
                    </Text>
                  </View>
                )}

                {/* [B] Presets med aktiv-markering */}
                <View style={styles.presetsGrid}>
                  {quickTimePresets.map((p, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.presetChip, selectedPresetIdx === idx && styles.presetChipActive]}
                      onPress={() => handleSelectTimePreset(p, idx)}
                    >
                      <Text style={[styles.presetChipText, selectedPresetIdx === idx && styles.presetChipTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Inställningar för PLATS */}
            {triggerType !== 'TIME' && (
              <View style={styles.locationSettingsContainer}>
                <View style={styles.locationNameRow}>
                  <TextInput
                    style={styles.placeNameInput}
                    placeholder="Namn på plats (t.ex. ICA Kvantum)"
                    placeholderTextColor={colors.textMuted}
                    value={placeName}
                    onChangeText={setPlaceName}
                  />
                  <TouchableOpacity
                    style={styles.currentLocBtn}
                    onPress={fetchCurrentLocation}
                    disabled={isFetchingLocation}
                  >
                    {isFetchingLocation ? (
                      <ActivityIndicator size="small" color={colors.accentCyan} />
                    ) : (
                      <Text style={styles.currentLocBtnText}>📍 Här</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {coords && (
                  <Text style={styles.coordsMuted}>
                    GPS: {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                  </Text>
                )}

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>RADIE FÖR ZON</Text>
                <View style={styles.radiusSelector}>
                  {[100, 150, 200, 500].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.radiusOptionBtn, radius === r && styles.radiusOptionActive]}
                      onPress={() => setRadius(r)}
                    >
                      <Text
                        style={[
                          styles.radiusOptionText,
                          radius === r && styles.radiusOptionTextActive,
                        ]}
                      >
                        {r} m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.radiusHelpText}>
                  Minsta tillåtna radie är 100 m för tillförlitlig triggning via mobilmaster och Wi-Fi utan att tömma batteriet.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Skapa-knapp */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.submitBtnText}>Aktivera larm on-device</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: radii.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
  },
  scrollBody: {
    marginBottom: spacing.md,
  },
  fieldSection: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  mainInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  addChecklistBtn: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  addChecklistBtnText: {
    color: colors.accentCyan,
    fontSize: 13,
    fontWeight: '600',
  },
  checklistSection: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checklistInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  checklistBullet: {
    color: colors.accentCyan,
    marginRight: 6,
    fontSize: 16,
  },
  checklistAddedText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
  },
  checklistRemoveText: {
    color: colors.dangerCoral,
    fontSize: 14,
    paddingHorizontal: 6,
  },
  checklistNewRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  checklistInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.textPrimary,
    fontSize: 13,
  },
  checklistAddActionBtn: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  checklistAddActionText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.surfaceHighlight,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
  },
  timeSettingsContainer: {
    marginBottom: spacing.md,
  },
  // [A] Rad med etikett + exakt klockslag
  activeTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  activeTimePreview: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeTimeClock: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accentCyan,
    letterSpacing: -0.3,
  },
  // [D] Midnattsvarning
  midnightWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  midnightWarningText: {
    fontSize: 12,
    color: colors.warningAmber,
    fontWeight: '600',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  // [B] Aktiv chip-stil
  presetChipActive: {
    backgroundColor: colors.accentCobalt,
    borderColor: colors.accentCyan,
  },
  presetChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  // [B] Aktiv chip-textstil
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  locationSettingsContainer: {
    marginBottom: spacing.md,
  },
  locationNameRow: {
    flexDirection: 'row',
    gap: 8,
  },
  placeNameInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
  },
  currentLocBtn: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currentLocBtnText: {
    color: colors.accentCyan,
    fontSize: 13,
    fontWeight: '700',
  },
  coordsMuted: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
  },
  radiusSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  radiusOptionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radii.md,
  },
  radiusOptionActive: {
    backgroundColor: colors.accentCobalt,
    borderColor: colors.accentCyan,
  },
  radiusOptionText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  radiusOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  radiusHelpText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: colors.accentCobalt,
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: 'center',
    shadowColor: colors.accentCyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
