import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import { colors, spacing, radii } from '../theme';
import { purgeAllLocalData } from '../services/db';
import { clearAllGeofences } from '../services/geofence';
import { cancelAllTimeAlarms } from '../services/notifications';

interface PrivacyScreenProps {
  onPurgeData?: () => void;
}

export const PrivacyScreen: React.FC<PrivacyScreenProps> = ({ onPurgeData }) => {
  const handlePurge = () => {
    Alert.alert(
      'GDPR: Rensa all data permanent?',
      'Detta raderar all lokal SQLite-historik och diagnostikdata, samt stoppar alla aktiva larm och geofences på enheten omedelbart.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Rensa allt',
          style: 'destructive',
          onPress: async () => {
            try {
              purgeAllLocalData();
              await clearAllGeofences();
              await cancelAllTimeAlarms();
              if (onPurgeData) onPurgeData();
              Alert.alert('Rensat', 'All data, alla schemalagda notiser och aktiva geofences har raderats permanent från enheten.');
            } catch (err: any) {
              Alert.alert('Fel vid rensning', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroSection}>
          <View style={styles.radarGraphic}>
            <View style={styles.radarRingOuter} />
            <View style={styles.radarRingMiddle} />
            <View style={styles.radarCenter}>
              <Text style={styles.radarCenterIcon}>🛡️</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>"Vi vet aldrig var du är."</Text>
          <Text style={styles.heroSubtitle}>
            Varje platsalarm exekveras till 100 % lokalt i telefonens hårdvara. Varken vi, servrar eller avsändare kan se din position.
          </Text>
        </View>

        {/* Hur det fungerar */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>⚙️ Hur on-device geofencing fungerar</Text>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>1</Text>
            <View style={styles.stepTextContainer}>
              <Text style={styles.stepTitle}>Geofence sparas on-device</Text>
              <Text style={styles.stepDesc}>
                När ett larm skapas sparas endast cirkelns mittpunkt och radie (t.ex. 150m) direkt i telefonens lokala säkerhetschip.
              </Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>2</Text>
            <View style={styles.stepTextContainer}>
              <Text style={styles.stepTitle}>Hårdvaran vaktar gränsen</Text>
              <Text style={styles.stepDesc}>
                iOS CoreLocation och Android Play Services känner av passage via master och Wi-Fi utan att hålla GPS-spårning aktiv.
              </Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>3</Text>
            <View style={styles.stepTextContainer}>
              <Text style={styles.stepTitle}>Lokal notis avfyras</Text>
              <Text style={styles.stepDesc}>
                När gränsen passeras väcks telefonen lokalt och plingar. Ingen GPS-data eller rörelsehändelse skickas till en server.
              </Text>
            </View>
          </View>
        </View>

        {/* Jämförelse mot OS-inbyggt */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>⚖️ Varför inte bara Apple/Google?</Text>
          <View style={styles.compareItem}>
            <Text style={styles.compareTitle}>🔄 Cross-Platform (iOS ↔ Android)</Text>
            <Text style={styles.compareDesc}>
              Apple Reminders kan aldrig skicka ett platslarm till en familjemedlem med en Android, och Google Keep fungerar inte sömlöst i bakgrunden på iPhone. Alarm App fungerar sömlöst mellan båda.
            </Text>
          </View>

          <View style={styles.compareItem}>
            <Text style={styles.compareTitle}>🚫 Strikt Anti-Probing (Princip 5)</Text>
            <Text style={styles.compareDesc}>
              Om en vän skickar ett larm ("Köp kaffe vid ICA") får vännen ALDRIG veta när du passerar butiken, såvida du inte själv aktivt klickar "Klar". Ingen kan använda appen för att stalka dig.
            </Text>
          </View>
        </View>

        {/* GDPR & Datakontroll */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>🔒 GDPR & Full Kontroll</Text>
          <Text style={styles.gdprDesc}>
            All mätdata och historik sparas i enhetens lokala SQLite-databas. Du har full rätt att radera all data med en enda knapptryckning.
          </Text>
          <TouchableOpacity style={styles.purgeBtn} onPress={handlePurge} activeOpacity={0.8}>
            <Text style={styles.purgeBtnText}>🗑️ GDPR: Rensa all lokal data permanent</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: 110,
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  radarGraphic: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  radarRingOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  radarRingMiddle: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  radarCenter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCenterIcon: {
    fontSize: 20,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    color: colors.accentCyan,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '800',
    fontSize: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.accentCyan,
  },
  stepTextContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  compareItem: {
    marginBottom: spacing.md,
  },
  compareTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentCyan,
    marginBottom: 2,
  },
  compareDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  gdprDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  purgeBtn: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: 1,
    borderColor: colors.dangerCoral,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  purgeBtnText: {
    color: colors.dangerCoral,
    fontSize: 12,
    fontWeight: '700',
  },
});
