import { activeAlarmKinds } from '../src/logic/permissionNeeds';
import { LocalAlarm } from '../src/types';

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
  it('schemalagda tidslarm och aktiva platslarm avgör vilka behörigheter som behövs', () => {
    expect(activeAlarmKinds([reminder('SCHEDULED'), reminder('ACTIVE_GEOFENCE')])).toEqual({
      hasTime: true,
      hasPlaces: true,
    });
    expect(activeAlarmKinds([reminder('DONE')])).toEqual({ hasTime: false, hasPlaces: false });
    expect(activeAlarmKinds()).toEqual({ hasTime: false, hasPlaces: false });
  });
});
