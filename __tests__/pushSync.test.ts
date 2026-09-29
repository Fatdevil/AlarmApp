jest.mock('../src/services/db', () => ({
  saveAlarm: jest.fn(),
  deleteAlarm: jest.fn(),
  getAlarm: jest.fn(() => null),
  updateAlarmStatus: jest.fn(),
}));
jest.mock('../src/services/geofence', () => ({
  assertCanAddGeofence: jest.fn(),
  syncGeofencesWithOs: jest.fn(async () => 1),
}));
jest.mock('../src/services/notifications', () => ({ presentFriendRequest: jest.fn() }));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));
jest.mock('expo-notifications', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(async () => null),
}));

/* eslint-disable import/first */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as db from '../src/services/db';
import * as geo from '../src/services/geofence';
import * as notif from '../src/services/notifications';
import {
  acceptFriendAlarm,
  extractSyncPayload,
  handleIncomingPushPayload,
  LEGACY_PUSH_TASK,
  unregisterLegacyPushTask,
} from '../src/services/pushSync';
/* eslint-enable import/first */

const alarm = {
  id: 'remote_1',
  creatorId: 'FRIEND_1',
  content: 'Köp kaffe',
  triggerType: 'ENTER_LOCATION',
  location: { id: 'loc_1', name: 'ICA', latitude: 59.3, longitude: 18.0, radius: 150 },
};

// Fångas innan beforeEach nollställer mockarna: vad modulen gjorde när den laddades
const definedTasksAtImport = (TaskManager.defineTask as jest.Mock).mock.calls.length;

beforeEach(() => jest.clearAllMocks());

describe('extractSyncPayload', () => {
  it('hittar payload i FCM:s dataString', () => {
    const raw = { data: { dataString: JSON.stringify({ type: 'SYNC_GEOFENCE', alarm }) } };
    expect(extractSyncPayload(raw)?.alarm).toEqual(alarm);
  });

  it('hittar payload i iOS-formatet (data-fält + dataString)', () => {
    const raw = {
      data: { type: 'SYNC_GEOFENCE', alarm, dataString: null },
      notification: null,
      aps: {},
    };
    expect(extractSyncPayload(raw)?.alarm).toEqual(alarm);
  });

  it('hittar payload i ett Expo Notification-omslag', () => {
    const raw = {
      date: 1,
      request: { identifier: 'x', content: { data: { type: 'SYNC_GEOFENCE', alarm } }, trigger: null },
    };
    expect(extractSyncPayload(raw)?.alarm).toEqual(alarm);
    expect(extractSyncPayload({ notification: raw, actionIdentifier: 'y' })?.alarm).toEqual(alarm);
  });

  it('ignorerar annan data', () => {
    expect(extractSyncPayload({ data: { type: 'OTHER' } })).toBeNull();
  });
});

describe('handleIncomingPushPayload', () => {
  it('sparar som förfrågan utan att registrera geofence', async () => {
    await expect(handleIncomingPushPayload({ type: 'SYNC_GEOFENCE', alarm })).resolves.toBe(true);
    expect(db.saveAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'remote_1', status: 'PENDING_ACCEPTANCE' })
    );
    expect(notif.presentFriendRequest).toHaveBeenCalled();
    expect(geo.syncGeofencesWithOs).not.toHaveBeenCalled();
  });

  it('avvisar ogiltig payload utan att spara', async () => {
    const bad = { type: 'SYNC_GEOFENCE', alarm: { ...alarm, location: { ...alarm.location, radius: 10 } } };
    await expect(handleIncomingPushPayload(bad)).resolves.toBe(false);
    expect(db.saveAlarm).not.toHaveBeenCalled();
  });

  it('är idempotent för redan kända larm', async () => {
    (db.getAlarm as jest.Mock).mockReturnValueOnce({ id: 'remote_1' });
    await expect(handleIncomingPushPayload({ type: 'SYNC_GEOFENCE', alarm })).resolves.toBe(false);
    expect(db.saveAlarm).not.toHaveBeenCalled();
  });
});

describe('acceptFriendAlarm', () => {
  it('aktiverar geofence', async () => {
    (db.getAlarm as jest.Mock).mockReturnValue({ ...alarm, status: 'PENDING_ACCEPTANCE' });
    await expect(acceptFriendAlarm('remote_1')).resolves.toBeUndefined();
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('remote_1', 'ACTIVE_GEOFENCE');
    expect(geo.syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });

  it('återgår till förfrågan om OS vägrar', async () => {
    (db.getAlarm as jest.Mock).mockReturnValue({ ...alarm, status: 'PENDING_ACCEPTANCE' });
    (geo.syncGeofencesWithOs as jest.Mock).mockRejectedValueOnce(new Error('Tillåt alltid'));
    await expect(acceptFriendAlarm('remote_1')).rejects.toThrow('Tillåt alltid');
    expect(db.updateAlarmStatus).toHaveBeenLastCalledWith('remote_1', 'PENDING_ACCEPTANCE');
  });
});

describe('unregisterLegacyPushTask', () => {
  it('avregistrerar push-tasken från äldre versioner', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(true);
    await unregisterLegacyPushTask();
    expect(Notifications.unregisterTaskAsync).toHaveBeenCalledWith(LEGACY_PUSH_TASK);
  });

  it('gör ingenting om tasken inte är registrerad', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(false);
    await unregisterLegacyPushTask();
    expect(Notifications.unregisterTaskAsync).not.toHaveBeenCalled();
  });

  it('definierar eller registrerar aldrig en push-task', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(false);
    await unregisterLegacyPushTask();
    expect(definedTasksAtImport).toBe(0);
    expect(Notifications.registerTaskAsync).not.toHaveBeenCalled();
  });
});
