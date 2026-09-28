import { activeAlarmKinds } from '../src/logic/permissionNeeds';
import { WakeAlarm } from '../src/logic/wake';
import { LocalAlarm } from '../src/types';

const wake = (enabled: boolean): WakeAlarm => ({
  id: 'w1',
  hour: 6,
  minute: 0,
  label: '',
  weekdays: [1, 2, 3, 4, 5],
  enabled,
  skipUntil: null,
  seriesId: null,
  seriesIndex: 0,
  osIds: [],
  planKey: null,
  nextFireAt: null,
  createdAt: new Date().toISOString(),
});

const reminder = (status: LocalAlarm['status']): LocalAlarm => ({
  id: 'a1',
  creatorId: 'ME',
  recipientId: 'ME',
  content: 'Test',
  triggerType: status === 'ACTIVE_GEOFENCE' ? 'EXIT_LOCATION' : 'TIME',
  status,
  createdAt: new Date().toISOString(),
});

describe('activeAlarmKinds', () => {
  it('påslagna väckningslarm kräver samma behörigheter som tidslarm', () => {
    expect(activeAlarmKinds([], [wake(true)])).toEqual({ hasTime: true, hasPlaces: false });
  });

  it('avstängda väckningslarm kräver ingenting', () => {
    expect(activeAlarmKinds([], [wake(false)])).toEqual({ hasTime: false, hasPlaces: false });
  });

  it('påminnelser räknas som tidigare', () => {
    expect(activeAlarmKinds([reminder('SCHEDULED'), reminder('ACTIVE_GEOFENCE')])).toEqual({
      hasTime: true,
      hasPlaces: true,
    });
    expect(activeAlarmKinds([reminder('DONE')])).toEqual({ hasTime: false, hasPlaces: false });
  });
});
