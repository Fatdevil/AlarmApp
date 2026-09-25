import React from 'react';
import { View, StyleSheet, Platform, StatusBar, ViewProps } from 'react-native';

export const SafeAreaView: React.FC<ViewProps> = ({ style, children, ...props }) => {
  return (
    <View
      style={[
        styles.safeArea,
        Platform.OS === 'android' && { paddingTop: StatusBar.currentHeight || 0 },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
