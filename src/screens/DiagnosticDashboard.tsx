import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import * as Location from 'expo-location';
import {
  LocalAlarm,
  DiagnosticLogEntry,
  GeofenceLocation,
} from '../types';
import {
  getAllAlarms,
  saveAlarm,
  deleteAlarm,
  getDiagnosticLogs,
  purgeAllDiagnosticData,
  exportLogsAsJson,
} from '../services/db';
import {
  scheduleTimeAlarm,
  cancelTimeAlarm,
  initNotificationChannels,
  requestNotificationPermissions,
  restoreAlarmsOnBoot,
} from '../services/notifications';
import {
  registerGeofence,
  removeGeofence,
  clearAllGeofences,
  requestLocationPermissions,
  checkLocationPermissions,
  MIN_GEOFENCE_RADIUS_METERS,
} from '../services/geofence';
import { getBatterySnapshot, BatterySnapshot } from '../services/battery';
import { handleIncomingPushPayload, setAckListener } from '../services/pushSync';

function formatSafeTime(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return '--:--';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  } catch {
    return '--:--';
  }
}

export default function DiagnosticDashboard() {
  const [alarms, setAlarms] = useState<LocalAlarm[]>([]);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [battery, setBattery] = useState<BatterySnapshot>({
    batteryLevel: -1,
    isCharging: false,
    lowPowerMode: false,
  });
  const [permissions, setPermissions] = useState({
    notifications: false,
    locationForeground: false,
    locationBackground: false,
  });
  const [selectedRadius, setSelectedRadius] = useState(150);
  const [latestAck, setLatestAck] = useState<string | null>(null);

  // Ladda systemdata och uppdatera vy
  const refreshData = useCallback(async () => {
    try {
      const bat = await getBatterySnapshot();
      setBattery(bat);

      const locPerms = await checkLocationPermissions();
      setPermissions((prev) => ({
        ...prev,
        locationForeground: locPerms.foreground,
        locationBackground: locPerms.background,
      }));

      setAlarms(getAllAlarms());
      setLogs(getDiagnosticLogs(30));
    } catch (err) {
      console.warn('[DiagnosticDashboard] refreshData fel:', err);
    }
  }, []);

  useEffect(() => {
    initNotificationChannels().catch(console.warn);
    refreshData();

    setAckListener((ack) => {
      setLatestAck(`ACK: ${ack.alarmId.substring(0, 6)}... -> REGISTERED`);
      refreshData();
    });

    const interval = setInterval(refreshData, 10000);
    return () => {
      clearInterval(interval);
      setAckListener(null);
    };
  }, [refreshData]);

  // Behörighetsbegäran
  const handleRequestPermissions = async () => {
    const notifGranted = await requestNotificationPermissions();
    const locGranted = await requestLocationPermissions();
    setPermissions({
      notifications: notifGranted,
      locationForeground: locGranted.foreground,
      locationBackground: locGranted.background,
    });
    refreshData();
  };

  // Skapa tidsalarm (+X minuter)
  const handleCreateTimeAlarm = async (minutesFromNow: number) => {
    try {
      const now = new Date();
      const fireDate = new Date(now.getTime() + minutesFromNow * 60 * 1000);
      const alarm: LocalAlarm = {
        id: `time_${Date.now()}`,
        creatorId: 'ME',
        recipientId: 'ME',
        content: `Testlarm om ${minutesFromNow} min (${formatSafeTime(fireDate)})`,
        triggerType: 'TIME',
        dateTime: fireDate.toISOString(),
        status: 'SCHEDULED',
        createdAt: now.toISOString(),
      };

      saveAlarm(alarm);
      await scheduleTimeAlarm(alarm);
      Alert.alert('Larm schemalagt', `Ringer: ${formatSafeTime(fireDate)}`);
      refreshData();
    } catch (e: any) {
      Alert.alert('Fel vid schemaläggning', e.message);
    }
  };

  // Skapa On-Device Geofence på nuvarande position
  const handleCreateGeofenceHere = async () => {
    try {
      if (!permissions.locationBackground) {
        Alert.alert(
          'Behörighet saknas',
          'Du måste bevilja "Always"-platsåtkomst för att registrera hårdvaru-geofencing.'
        );
        return;
      }

      if (selectedRadius < MIN_GEOFENCE_RADIUS_METERS) {
        Alert.alert('Ogiltig radie', `Minsta tillåtna radie är ${MIN_GEOFENCE_RADIUS_METERS} meter.`);
        return;
      }

      const currentPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const locationId = `geo_${Date.now()}`;
      const location: GeofenceLocation = {
        id: locationId,
        name: `Zon vid position (${selectedRadius}m)`,
        latitude: currentPos.coords.latitude,
        longitude: currentPos.coords.longitude,
        radius: selectedRadius,
      };

      const alarm: LocalAlarm = {
        id: `alarm_${locationId}`,
        creatorId: 'ME',
        recipientId: 'ME',
        content: `Du är i zonen (${selectedRadius}m radie)`,
        triggerType: 'ENTER_LOCATION',
        location,
        status: 'ACTIVE_GEOFENCE',
        createdAt: new Date().toISOString(),
      };

      saveAlarm(alarm);
      await registerGeofence(location, alarm);
      Alert.alert('Geofence registrerat', `Zon skapad med ${selectedRadius}m radie on-device.`);
      refreshData();
    } catch (e: any) {
      Alert.alert('Fel vid geofence', e.message);
    }
  };

  // Simulera inkommande vänalarm via Remote Push (Fas 5)
  const handleSimulateIncomingPush = async () => {
    try {
      const currentPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const simulatedAlarm: LocalAlarm = {
        id: `remote_${Date.now()}`,
        creatorId: 'FRIEND_STELLAN',
        recipientId: 'ME',
        content: 'Vän-larm: Köp kaffe när du kommer fram!',
        triggerType: 'ENTER_LOCATION',
        location: {
          id: `friend_geo_${Date.now()}`,
          name: 'Stellans Platsalarm',
          latitude: currentPos.coords.latitude,
          longitude: currentPos.coords.longitude,
          radius: selectedRadius,
        },
        status: 'SCHEDULED',
        createdAt: new Date().toISOString(),
      };

      await handleIncomingPushPayload({
        type: 'SYNC_GEOFENCE',
        alarm: simulatedAlarm,
      });

      Alert.alert('Push-synk testad', 'Vänalarm mottaget, geofence aktiverat, och strikt ACK skickat!');
      refreshData();
    } catch (e: any) {
      Alert.alert('Push-fel', e.message);
    }
  };

  // Återställning vid omstart (Test av Fas 3)
  const handleSimulateReboot = async () => {
    const count = await restoreAlarmsOnBoot();
    Alert.alert('Reboot-återställning klar', `${count} larm återskapades i OS.`);
    refreshData();
  };

  // Rensa alla Geofences
  const handleClearGeofences = async () => {
    await clearAllGeofences();
    refreshData();
    Alert.alert('Rensat', 'Alla aktiva geofences avregistrerades från OS.');
  };

  // Radera ett specifikt larm
  const handleDeleteAlarm = async (alarm: LocalAlarm) => {
    if (alarm.triggerType === 'TIME' && alarm.notificationId) {
      await cancelTimeAlarm(alarm.notificationId);
    } else if (alarm.location) {
      await removeGeofence(alarm.location.id);
    }
    deleteAlarm(alarm.id);
    refreshData();
  };

  // Exportera diagnostikdata (AirDrop, Mail, Notiser m.m.)
  const handleExportData = async (anonymize: boolean) => {
    try {
      const json = exportLogsAsJson(anonymize);
      await Share.share({
        title: `AlarmApp_PoC_Logs_${Date.now()}`,
        message: json,
      });
    } catch (e: any) {
      Alert.alert('Export misslyckades', e.message);
    }
  };

  // GDPR: Rensa diagnostikdatabas
  const handlePurgeLogs = () => {
    Alert.alert(
      'GDPR: Rensa all diagnostikdata?',
      'Detta raderar all lokal logghistorik permanent.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Rensa',
          style: 'destructive',
          onPress: () => {
            purgeAllDiagnosticData();
            refreshData();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>Alarm App PoC (R0)</Text>
          <Text style={styles.subtitle}>
            Hårdvaruverifiering · On-Device Geofencing · Offline Alarms
          </Text>
        </View>

        {/* System & Batteristatus */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📱 System- & Batteristatus</Text>
          <View style={styles.statusRow}>
            <Text style={styles.label}>OS & Plattform:</Text>
            <Text style={styles.value}>
              {Platform.OS.toUpperCase()} {Platform.Version}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Batterinivå:</Text>
            <Text style={styles.value}>
              {battery.batteryLevel >= 0 ? `${Math.round(battery.batteryLevel * 100)} %` : 'N/A'}
              {battery.isCharging ? ' ⚡ (Laddar)' : ''}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Low Power Mode:</Text>
            <Text style={[styles.value, battery.lowPowerMode && styles.warningText]}>
              {battery.lowPowerMode ? '⚠️ AKTIVT (Strömsparläge)' : 'Av'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Notiser:</Text>
            <Text style={permissions.notifications ? styles.successText : styles.errorText}>
              {permissions.notifications ? 'Beviljad' : 'Nekad'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Plats Always (Bakgrund):</Text>
            <Text style={permissions.locationBackground ? styles.successText : styles.errorText}>
              {permissions.locationBackground ? 'Beviljad (Always)' : 'Ej Always'}
            </Text>
          </View>

          {(!permissions.notifications || !permissions.locationBackground) && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestPermissions}>
              <Text style={styles.btnText}>Bevilja nödvändiga behörigheter</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tidsalarm-sektion (Fas 3) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⏰ Lokala Tidsalarm (Fas 3)</Text>
          <Text style={styles.cardDesc}>
            Testa att larmet fungerar offline och överlever en omstart.
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleCreateTimeAlarm(1)}>
              <Text style={styles.btnText}>+1 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleCreateTimeAlarm(5)}>
              <Text style={styles.btnText}>+5 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleCreateTimeAlarm(30)}>
              <Text style={styles.btnText}>+30 min</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleSimulateReboot}>
            <Text style={styles.secondaryBtnText}>🔄 Simulera Reboot-återställning</Text>
          </TouchableOpacity>
        </View>

        {/* Geofence-sektion (Fas 4) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 On-Device Geofencing (Fas 4)</Text>
          <Text style={styles.cardDesc}>
            Hårdvarubaserad övervakning. Minsta radie: 100 meter.
          </Text>

          <View style={styles.radiusSelector}>
            <Text style={styles.label}>Välj testradie:</Text>
            <View style={styles.radiusBtns}>
              {[100, 150, 200].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.radiusBtn, selectedRadius === r && styles.radiusBtnActive]}
                  onPress={() => setSelectedRadius(r)}
                >
                  <Text style={[styles.radiusBtnText, selectedRadius === r && styles.radiusBtnTextActive]}>
                    {r} m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateGeofenceHere}>
            <Text style={styles.btnText}>📍 Sätt Geofence på min plats ({selectedRadius}m)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerBtn} onPress={handleClearGeofences}>
            <Text style={styles.dangerBtnText}>Rensa alla aktiva Geofences</Text>
          </TouchableOpacity>
        </View>

        {/* Remote Push & Anti-Probing (Fas 5) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📡 Push-Synk & Anti-Probing (Fas 5)</Text>
          <Text style={styles.cardDesc}>
            Simulerar att en vän skickar ett platsalarm via push. Verifierar strikt ACK utan position.
          </Text>
          <TouchableOpacity style={styles.actionBtn} onPress={handleSimulateIncomingPush}>
            <Text style={styles.btnText}>Simulera mottaget Vänalarm</Text>
          </TouchableOpacity>
          {latestAck && <Text style={styles.ackBanner}>{latestAck}</Text>}
        </View>

        {/* Aktiva Larm i SQLite */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Aktiva Larm ({alarms.length})</Text>
          {alarms.length === 0 ? (
            <Text style={styles.emptyText}>Inga larm sparade i lokal SQLite.</Text>
          ) : (
            alarms.map((alarm) => (
              <View key={alarm.id} style={styles.alarmItem}>
                <View style={styles.alarmDetails}>
                  <Text style={styles.alarmContent}>{alarm.content}</Text>
                  <Text style={styles.alarmMeta}>
                    Typ: {alarm.triggerType} · Status: {alarm.status}
                    {alarm.location ? ` · Radie: ${alarm.location.radius}m` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteAlarm(alarm)}
                >
                  <Text style={styles.deleteBtnText}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Mätlogg & Export (Fas 6 & GDPR) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>📊 Diagnostiklogg ({logs.length})</Text>
            <TouchableOpacity onPress={refreshData}>
              <Text style={styles.linkText}>Uppdatera</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => handleExportData(true)}>
              <Text style={styles.smallBtnText}>Exportera Anonymiserad</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallBtn} onPress={() => handleExportData(false)}>
              <Text style={styles.smallBtnText}>Exportera Rådata</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.purgeBtn} onPress={handlePurgeLogs}>
            <Text style={styles.purgeBtnText}>🗑️ GDPR: Rensa all Diagnostikdata</Text>
          </TouchableOpacity>

          <View style={styles.logList}>
            {logs.slice(0, 15).map((log) => (
              <View key={log.id} style={styles.logItem}>
                <View style={styles.logHeader}>
                  <Text style={styles.logEventType}>{log.eventType}</Text>
                  <Text style={styles.logTime}>
                    {formatSafeTime(log.timestamp)}
                  </Text>
                </View>
                <Text style={styles.logMeta}>
                  Bat: {log.batteryLevel >= 0 ? `${Math.round(log.batteryLevel * 100)}%` : 'N/A'}
                  {log.lowPowerMode ? ' [SPARLÄGE]' : ''} · State: {log.lifecycleState}
                  {log.delayMs ? ` · Latens: ${log.delayMs}ms` : ''}
                </Text>
                {log.note && <Text style={styles.logNote}>{log.note}</Text>}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    padding: 16,
    paddingBottom: 110,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    color: '#94A3B8',
  },
  value: {
    fontSize: 13,
    color: '#F8FAFC',
    fontWeight: '500',
  },
  successText: {
    fontSize: 13,
    color: '#4ADE80',
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    color: '#F87171',
    fontWeight: '600',
  },
  warningText: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtn: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontWeight: '500',
    fontSize: 13,
  },
  dangerBtnText: {
    color: '#F87171',
    fontWeight: '600',
    fontSize: 13,
  },
  radiusSelector: {
    marginVertical: 8,
  },
  radiusBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  radiusBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#334155',
    borderRadius: 6,
    alignItems: 'center',
  },
  radiusBtnActive: {
    backgroundColor: '#0284C7',
  },
  radiusBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  radiusBtnTextActive: {
    color: '#FFFFFF',
  },
  ackBanner: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#064E3B',
    color: '#34D399',
    borderRadius: 6,
    fontSize: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  alarmItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  alarmDetails: {
    flex: 1,
  },
  alarmContent: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '500',
  },
  alarmMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  deleteBtn: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: '#FECACA',
    fontSize: 12,
    fontWeight: '600',
  },
  linkText: {
    color: '#38BDF8',
    fontSize: 13,
  },
  smallBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  smallBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '500',
  },
  purgeBtn: {
    backgroundColor: '#450A0A',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  purgeBtnText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  logList: {
    marginTop: 4,
  },
  logItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logEventType: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  logTime: {
    color: '#64748B',
    fontSize: 11,
  },
  logMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  logNote: {
    color: '#CBD5E1',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 1,
  },
});
