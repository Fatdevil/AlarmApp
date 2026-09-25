import {
  canUseFullScreenAlarms,
  getNativeAlarmAuthorization,
  getScheduledNativeAlarmIds,
  isNativeAlarmAvailable,
  scheduleNativeAlarm,
} from '../modules/native-alarm';

// Utan native-kod (Expo Go, webb, tester) ska modulen vara otillgänglig – aldrig krascha
describe('native-alarm utan native-modul', () => {
  it('rapporterar otillgänglig och faller tillbaka', async () => {
    expect(isNativeAlarmAvailable()).toBe(false);
    await expect(getNativeAlarmAuthorization()).resolves.toBe('unavailable');
    await expect(getScheduledNativeAlarmIds()).resolves.toEqual([]);
    expect(canUseFullScreenAlarms()).toBe(true);
    await expect(
      scheduleNativeAlarm({ id: 'x', title: 't', date: new Date(), weekdays: [] })
    ).rejects.toThrow();
  });
});
