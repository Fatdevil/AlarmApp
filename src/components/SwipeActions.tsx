/**
 * Svep åt höger = Klar, åt vänster = Radera. Används av både kort och rader.
 */
import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { makeStyles, spacing, typography } from '../theme';
import { Icon } from './ui';

// Fasta färger: vit text klarar 4.5:1 mot båda i både ljust och mörkt tema
const COMPLETE_BG = '#047857';
const DELETE_BG = '#BE123C';
const ON_SWIPE = '#FFFFFF';

interface Props {
  canComplete: boolean;
  onComplete: () => void;
  onDelete: () => void;
  radius?: number;
  children: React.ReactNode;
}

export function SwipeActions({ canComplete, onComplete, onDelete, radius = 0, children }: Props) {
  const styles = useStyles();
  const swipeRef = useRef<SwipeableMethods>(null);

  const renderLeft = () => (
    <View style={[styles.action, styles.left, { borderRadius: radius }]}>
      <Icon name="checkmark-circle" size={26} color={ON_SWIPE} />
      <Text style={styles.text}>Klar</Text>
    </View>
  );

  const renderRight = () => (
    <View style={[styles.action, styles.right, { borderRadius: radius }]}>
      <Text style={styles.text}>Radera</Text>
      <Icon name="trash" size={24} color={ON_SWIPE} />
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={80}
      rightThreshold={80}
      renderLeftActions={canComplete ? renderLeft : undefined}
      renderRightActions={renderRight}
      onSwipeableOpen={(direction) => {
        swipeRef.current?.close();
        // direction anger åt vilket håll raden drogs: 'right' = vänster åtgärd syns
        if (direction === 'right') onComplete();
        else onDelete();
      }}
      containerStyle={{ borderRadius: radius }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const useStyles = makeStyles(() => ({
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  left: { backgroundColor: COMPLETE_BG, justifyContent: 'flex-start' },
  right: { backgroundColor: DELETE_BG, justifyContent: 'flex-end' },
  text: { ...typography.callout, fontWeight: '700', color: ON_SWIPE },
}));
