import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNDO_TIMEOUT_MS } from '../constants';
import { makeStyles, MIN_TOUCH, radii, spacing, typography } from '../theme';

interface SnackbarMessage {
  id: number;
  text: string;
  onUndo?: () => void;
}

interface SnackbarApi {
  show: (text: string, onUndo?: () => void) => void;
}

const SnackbarContext = createContext<SnackbarApi>({ show: () => {} });

export function useSnackbar(): SnackbarApi {
  return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMessage(null);
  }, []);

  const show = useCallback((text: string, onUndo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setMessage({ id: seq.current, text, onUndo });
    AccessibilityInfo.announceForAccessibility(onUndo ? `${text}. Ångra finns tillgängligt.` : text);
    timer.current = setTimeout(() => setMessage(null), UNDO_TIMEOUT_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <SnackbarContext.Provider value={{ show }}>
      {children}
      {message && (
        <Animated.View
          key={message.id}
          entering={FadeInDown}
          exiting={FadeOutDown}
          style={[styles.container, { bottom: insets.bottom + spacing.lg }]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.bar}>
            <Text style={styles.text} numberOfLines={2}>
              {message.text}
            </Text>
            {message.onUndo && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ångra"
                onPress={() => {
                  message.onUndo?.();
                  dismiss();
                }}
                style={styles.undo}
              >
                <Text style={styles.undoText}>Ångra</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </SnackbarContext.Provider>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  container: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark ? '#E2E8F0' : '#1E293B',
    borderRadius: radii.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    minHeight: 52,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { ...typography.footnote, flex: 1, color: dark ? '#0F172A' : '#F8FAFC' },
  undo: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: spacing.md, justifyContent: 'center' },
  undoText: { ...typography.callout, fontWeight: '800', color: dark ? '#1D4ED8' : '#93C5FD' },
}));
