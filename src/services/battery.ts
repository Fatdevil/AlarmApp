import * as Battery from 'expo-battery';

export interface BatterySnapshot {
  batteryLevel: number;
  isCharging: boolean;
  lowPowerMode: boolean;
}

export async function getBatterySnapshot(): Promise<BatterySnapshot> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    const batteryState = await Battery.getBatteryStateAsync();
    const isCharging = 
      batteryState === Battery.BatteryState.CHARGING || 
      batteryState === Battery.BatteryState.FULL;
    
    const lowPowerMode = await Battery.isLowPowerModeEnabledAsync();

    return {
      batteryLevel: level !== -1 ? Math.round(level * 100) / 100 : -1,
      isCharging,
      lowPowerMode,
    };
  } catch {
    // Fallback om enheten/simulatorn saknar batterisensor
    return {
      batteryLevel: -1,
      isCharging: false,
      lowPowerMode: false,
    };
  }
}
