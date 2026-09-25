import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { colors, spacing, radii } from '../theme';

export type TabKey = 'alarms' | 'privacy' | 'diagnostic';

interface TabBarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onPressAdd: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onSelectTab,
  onPressAdd,
}) => {
  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarContainer}>
        {/* Flik: Alarm */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'alarms' && styles.tabItemActive]}
          onPress={() => onSelectTab('alarms')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'alarms' && styles.tabIconActive]}>⏰</Text>
          <Text style={[styles.tabText, activeTab === 'alarms' && styles.tabTextActive]}>Larm</Text>
        </TouchableOpacity>

        {/* Flik: Integritet */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'privacy' && styles.tabItemActive]}
          onPress={() => onSelectTab('privacy')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'privacy' && styles.tabIconActive]}>🛡️</Text>
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>Integritet</Text>
        </TouchableOpacity>

        {/* Flik: Diagnostik */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'diagnostic' && styles.tabItemActive]}
          onPress={() => onSelectTab('diagnostic')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'diagnostic' && styles.tabIconActive]}>🛠️</Text>
          <Text style={[styles.tabText, activeTab === 'diagnostic' && styles.tabTextActive]}>R0 Rig</Text>
        </TouchableOpacity>
      </View>

      {/* Flytande FAB (+) Knappen */}
      <TouchableOpacity
        style={styles.fabButton}
        onPress={onPressAdd}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tabBarContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(19, 27, 43, 0.95)',
    borderRadius: radii.pill,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  tabItemActive: {
    backgroundColor: colors.surfaceHighlight,
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.6,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentCobalt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentCyan,
    shadowColor: colors.accentCyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 30,
  },
});
