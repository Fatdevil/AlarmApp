import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, AppState, LogBox } from 'react-native';
import { LocalAlarm } from './src/types';
import {
  getAllAlarms,
  saveAlarm,
  deleteAlarm,
  updateAlarmStatus,
  toggleChecklistItem,
} from './src/services/db';
import {
  scheduleTimeAlarm,
  cancelTimeAlarm,
  restoreAlarmsOnBoot,
  initNotificationChannels,
} from './src/services/notifications';
import { registerGeofence, removeGeofence, restoreGeofencesOnBoot } from './src/services/geofence';
import { setupPushListeners } from './src/services/pushSync';
import { TabBar, TabKey } from './src/components/TabBar';
import { AlarmHomeScreen } from './src/screens/AlarmHomeScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import DiagnosticDashboard from './src/screens/DiagnosticDashboard';
import { CreateAlarmModal } from './src/components/CreateAlarmModal';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { colors } from './src/theme';
import './src/services/geofence'; // Säkerställer att TaskManager.defineTask registreras vid appstart

// Ignorera icke-kritiska utvecklingsvarningar från Expo Go så att skärmen förblir ren
LogBox.ignoreAllLogs(true);
LogBox.ignoreLogs([
  'Unable to resolve manifest assets',
  'expo-notifications',
  'Calling Notifications',
  'Request to https://exp.host',
  'SafeAreaView',
]);

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('alarms');
  const [alarms, setAlarms] = useState<LocalAlarm[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const refreshAlarms = useCallback(() => {
    try {
      setAlarms(getAllAlarms());
    } catch (e) {
      console.warn('[App] refreshAlarms fel:', e);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      // 1. Initiera kanaler och återställ schemalagda larm (Tid och Geofence) vid boot/launch
      try {
        await initNotificationChannels();
      } catch (err) {
        console.warn('[AppInit] Notiskanaler:', err);
      }

      try {
        await restoreAlarmsOnBoot();
      } catch (err) {
        console.warn('[AppInit] Tidsalarm:', err);
      }

      try {
        await restoreGeofencesOnBoot();
      } catch (err) {
        console.warn('[AppInit] Geofences:', err);
      }

      if (isMounted) {
        refreshAlarms();
      }
    }

    initApp();

    // 2. Koppla på push-lyssnare
    const unsubscribePush = setupPushListeners();

    // 3. Lyssna på appens livscykel: uppdatera automatiskt när användaren återvänder från bakgrunden
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isMounted) {
        refreshAlarms();
      }
    });

    return () => {
      isMounted = false;
      unsubscribePush();
      appStateSub.remove();
    };
  }, [refreshAlarms]);

  // Skapa nytt larm från konsumentflödet (< 10s modalen)
  const handleSaveNewAlarm = async (newAlarm: LocalAlarm) => {
    // 1. Spara i lokal SQLite
    saveAlarm(newAlarm);

    // 2. Schemalägg i OS (Tid eller Geofence)
    if (newAlarm.triggerType === 'TIME') {
      await scheduleTimeAlarm(newAlarm);
    } else if (newAlarm.location) {
      await registerGeofence(newAlarm.location, newAlarm);
    }

    refreshAlarms();
  };

  // Bocka av punkt i checklista
  const handleToggleChecklist = (alarmId: string, itemId: string) => {
    toggleChecklistItem(alarmId, itemId);
    refreshAlarms();
  };

  // Markera larm som klart (P0 Buggfix: Avbryter schemalagd OS-notis vid slutförande)
  const handleMarkDone = async (alarm: LocalAlarm) => {
    updateAlarmStatus(alarm.id, 'DONE', new Date().toISOString());
    if (alarm.triggerType === 'TIME' && alarm.notificationId) {
      await cancelTimeAlarm(alarm.notificationId);
    } else if (alarm.location) {
      await removeGeofence(alarm.location.id);
    }
    refreshAlarms();
  };

  // Radera / Avbryt larm (P0 Buggfix: Avbryter schemalagd OS-notis vid radering)
  const handleDeleteAlarm = async (alarm: LocalAlarm) => {
    if (alarm.triggerType === 'TIME' && alarm.notificationId) {
      await cancelTimeAlarm(alarm.notificationId);
    } else if (alarm.location) {
      await removeGeofence(alarm.location.id);
    }
    deleteAlarm(alarm.id);
    refreshAlarms();
  };

  return (
    <ErrorBoundary>
      <View style={styles.appContainer}>
        {/* Skärminnehåll baserat på aktiv flik */}
        {activeTab === 'alarms' && (
          <AlarmHomeScreen
            alarms={alarms}
            onToggleChecklist={handleToggleChecklist}
            onMarkDone={handleMarkDone}
            onDelete={handleDeleteAlarm}
            onRefresh={refreshAlarms}
            onPressAdd={() => setCreateModalVisible(true)}
          />
        )}

        {activeTab === 'privacy' && (
          <PrivacyScreen onPurgeData={refreshAlarms} />
        )}

        {activeTab === 'diagnostic' && (
          <DiagnosticDashboard />
        )}

        {/* Flytande Pill TabBar med FAB (+) */}
        <TabBar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onPressAdd={() => setCreateModalVisible(true)}
        />

        {/* Snabbt Skapa-Larm Modal (<10s) */}
        <CreateAlarmModal
          visible={createModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onSave={handleSaveNewAlarm}
        />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
