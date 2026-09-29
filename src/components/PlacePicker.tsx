/**
 * Välj en plats via adressökning eller nuvarande position. Används av "Nytt larm" och
 * "Mina platser". Positionen används bara på telefonen.
 */
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { showSettingsAlert } from '../services/permissionFlow';
import { makeStyles, radii, spacing, typography, useTheme } from '../theme';
import { Button, Icon } from './ui';

export interface PickedPlace {
  name: string;
  latitude: number;
  longitude: number;
  isCurrentPosition: boolean;
}

function formatAddress(a: Location.LocationGeocodedAddress | undefined, fallback: string): string {
  if (!a) return fallback;
  const street = [a.street, a.streetNumber].filter(Boolean).join(' ');
  return [a.name && a.name !== street ? a.name : null, street || null, a.city]
    .filter(Boolean)
    .slice(0, 2)
    .join(', ') || fallback;
}

interface PlacePickerProps {
  value: PickedPlace | null;
  onChange: (place: PickedPlace) => void;
}

export function PlacePicker({ value, onChange }: PlacePickerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const pickCurrentPosition = async () => {
    setIsLocating(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) {
        showSettingsAlert('Platsåtkomst', 'Tillåt platsåtkomst för att använda din position.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      onChange({
        name: formatAddress(address, 'Min position'),
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        isCurrentPosition: true,
      });
    } catch (err) {
      Alert.alert('Kunde inte hämta position', err instanceof Error ? err.message : String(err));
    } finally {
      setIsLocating(false);
    }
  };

  const searchAddress = async () => {
    const q = query.trim();
    if (!q) return;
    setIsLocating(true);
    try {
      const [hit] = await Location.geocodeAsync(q);
      if (!hit) {
        Alert.alert('Hittade ingen plats', `Inget resultat för "${q}". Prova med gata och ort.`);
        return;
      }
      const [address] = await Location.reverseGeocodeAsync(hit).catch(() => []);
      onChange({
        name: formatAddress(address, q),
        latitude: hit.latitude,
        longitude: hit.longitude,
        isCurrentPosition: false,
      });
    } catch (err) {
      Alert.alert('Sökningen misslyckades', err instanceof Error ? err.message : String(err));
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Sök adress, t.ex. Drottninggatan 1, Stockholm"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={searchAddress}
          returnKeyType="search"
          accessibilityLabel="Sök adress"
        />
        <Button compact variant="secondary" title="Sök" onPress={searchAddress} disabled={isLocating} />
      </View>
      <Button
        variant="ghost"
        icon="locate"
        title="Använd min nuvarande position"
        onPress={pickCurrentPosition}
        disabled={isLocating}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
      />
      {isLocating && <ActivityIndicator color={colors.accentText} />}
      {value && (
        <View style={styles.placeBox}>
          <Icon name="location" size={20} color={colors.accentText} />
          <Text style={styles.placeName}>{value.name}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
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
  placeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeName: { ...typography.callout, color: colors.textPrimary, flex: 1 },
}));
