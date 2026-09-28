import { LocalAlarm } from '../src/types';

const mockRegionStates = new Map<string, string>();

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  getTaskOptionsAsync: jest.fn(async () => ({})),
}));
jest.mock('expo-location', () => ({
  GeofencingEventType: { Enter: 1, Exit: 2 },
  startGeofencingAsync: jest.fn(async () => {}),
  stopGeofencingAsync: jest.fn(async () => {}),
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock('../src/services/db', () => ({
  findAlarmByLocationId: jest.fn(),
  getAlarmsByStatus: jest.fn(() => []),
  updateAlarmStatus: jest.fn(),
  getRegionState: jest.fn((id: string) => mockRegionStates.get(id) ?? 'UNKNOWN'),
  setRegionState: jest.fn((id: string, s: string) => mockRegionStates.set(id, s)),
  pruneRegionStates: jest.fn(),
}));
jest.mock('../src/services/notifications', () => ({ fireGeofenceNotification: jest.fn() }));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));

/* eslint-disable import/first */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as db from '../src/services/db';
import * as notif from '../src/services/notifications';
import { syncGeofencesWithOs } from '../src/services/geofence';
/* eslint-enable import/first */

// Bakgrundsfunktionen som geofence.ts registrerar vid import
const taskHandler = (TaskManager.defineTask as jest.Mock).mock.calls[0][1] as (body: {
  data?: unknown;
}) => Promise<void>;

const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;

const place = { id: 'loc_1', name: 'Hem', latitude: 59, longitude: 18, radius: 200 };

function locationAlarm(triggerType: LocalAlarm['triggerType']): LocalAlarm {
  return {
    id: 'alarm_1',
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'Ta med matlådan',
    triggerType,
    location: place,
    status: 'ACTIVE_GEOFENCE',
    createdAt: new Date().toISOString(),
  };
}

function event(type: 'enter' | 'exit') {
  return taskHandler({
    data: {
      eventType: type === 'enter' ? 1 : 2,
      region: { identifier: place.id, latitude: 59, longitude: 18, radius: 200 },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRegionStates.clear();
});

describe('geofence-task: lägesbesked vs passage', () => {
  it('"lämnar" skapat när man redan är ute larmar inte direkt, men vid nästa utpassering', async () => {
    m(db.findAlarmByLocationId).mockReturnValue(locationAlarm('EXIT_LOCATION'));

    await event('exit'); // första lägesbesked efter registrering
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();

    await event('enter'); // kommer hem
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();

    await event('exit'); // lämnar hemmet
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(1);
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('alarm_1', 'FIRED_LOCALLY');
  });

  it('"kommer fram" skapat när man redan är på platsen larmar först efter att man lämnat och kommit tillbaka', async () => {
    m(db.findAlarmByLocationId).mockReturnValue(locationAlarm('ENTER_LOCATION'));

    await event('enter');
    await event('enter'); // dubblett
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();

    await event('exit');
    await event('enter');
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(1);
  });

  it('sparar läget även när larmet inte längre är aktivt', async () => {
    m(db.findAlarmByLocationId).mockReturnValue(null);
    await event('enter');
    expect(db.setRegionState).toHaveBeenCalledWith(place.id, 'INSIDE');
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();
  });
});

describe('syncGeofencesWithOs', () => {
  it('registrerar båda riktningarna för varje zon', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([locationAlarm('EXIT_LOCATION')]);
    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).toHaveBeenCalledWith(expect.any(String), [
      expect.objectContaining({ identifier: place.id, notifyOnEnter: true, notifyOnExit: true }),
    ]);
    expect(db.pruneRegionStates).toHaveBeenCalledWith([place.id]);
  });

  it('registrerar inte om när zonerna är oförändrade (undviker nya lägesbesked)', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([locationAlarm('EXIT_LOCATION')]);
    m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    m(TaskManager.getTaskOptionsAsync).mockResolvedValue({
      regions: [{ identifier: place.id, latitude: 59, longitude: 18, radius: 200, notifyOnEnter: true, notifyOnExit: true }],
    });
    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('registrerar om äldre zoner som bara bevakade en riktning', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([locationAlarm('EXIT_LOCATION')]);
    m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    m(TaskManager.getTaskOptionsAsync).mockResolvedValue({
      regions: [{ identifier: place.id, latitude: 59, longitude: 18, radius: 200, notifyOnEnter: false, notifyOnExit: true }],
    });
    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).toHaveBeenCalledTimes(1);
  });

  it('stoppar bevakningen och rensar lägen när inga platslarm finns', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([]);
    m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    await syncGeofencesWithOs();
    expect(Location.stopGeofencingAsync).toHaveBeenCalled();
    expect(db.pruneRegionStates).toHaveBeenCalledWith([]);
  });
});
