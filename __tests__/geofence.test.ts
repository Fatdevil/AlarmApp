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
  findActiveAlarmsByLocationId: jest.fn(() => []),
  getAlarmsByStatus: jest.fn(() => []),
  updateAlarmStatus: jest.fn(),
  getRegionState: jest.fn((id: string) => mockRegionStates.get(id) ?? 'UNKNOWN'),
  setRegionState: jest.fn((id: string, s: string) => mockRegionStates.set(id, s)),
  clearRegionStates: jest.fn((ids: string[]) => ids.forEach((id) => mockRegionStates.delete(id))),
  pruneRegionStates: jest.fn((keep: string[]) => {
    for (const id of [...mockRegionStates.keys()]) if (!keep.includes(id)) mockRegionStates.delete(id);
  }),
}));
jest.mock('../src/services/notifications', () => ({ fireGeofenceNotification: jest.fn() }));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));

/* eslint-disable import/first */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as db from '../src/services/db';
import * as notif from '../src/services/notifications';
import { assertCanAddGeofence, syncGeofencesWithOs } from '../src/services/geofence';
/* eslint-enable import/first */

// Bakgrundsfunktionen som geofence.ts registrerar vid import
const taskHandler = (TaskManager.defineTask as jest.Mock).mock.calls[0][1] as (body: {
  data?: unknown;
}) => Promise<void>;

const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;

const home = { id: 'loc_home', name: 'Hem', latitude: 59, longitude: 18, radius: 200 };
const work = { id: 'loc_work', name: 'Jobb', latitude: 58, longitude: 17, radius: 200 };

function locationAlarm(
  triggerType: LocalAlarm['triggerType'],
  overrides: Partial<LocalAlarm> = {}
): LocalAlarm {
  return {
    id: 'alarm_1',
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'Ta med matlådan',
    triggerType,
    location: home,
    status: 'ACTIVE_GEOFENCE',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function osRegion(loc: typeof home) {
  return {
    identifier: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius,
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

/** OS har redan zonerna registrerade (oförändrad uppsättning). */
function osHasRegions(...locs: (typeof home)[]) {
  m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
  m(TaskManager.getTaskOptionsAsync).mockResolvedValue({ regions: locs.map(osRegion) });
}

function event(type: 'enter' | 'exit', loc = home) {
  return taskHandler({
    data: {
      eventType: type === 'enter' ? 1 : 2,
      region: { identifier: loc.id, latitude: loc.latitude, longitude: loc.longitude, radius: loc.radius },
    },
  });
}

/** Aktiva larm i "databasen", både för synk och för händelser. */
function activeAlarms(...alarms: LocalAlarm[]) {
  m(db.getAlarmsByStatus).mockReturnValue(alarms);
  m(db.findActiveAlarmsByLocationId).mockImplementation((id) => alarms.filter((a) => a.location?.id === id));
}

beforeEach(() => {
  jest.clearAllMocks();
  m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false);
  m(TaskManager.getTaskOptionsAsync).mockResolvedValue({});
  mockRegionStates.clear();
});

describe('geofence-task: lägesbesked vs passage', () => {
  it('"lämnar" skapat när man redan är ute larmar inte direkt, men vid nästa utpassering', async () => {
    activeAlarms(locationAlarm('EXIT_LOCATION'));
    osHasRegions(home);

    await event('exit'); // första lägesbesked efter registrering
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();

    await event('enter'); // kommer hem
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();

    await event('exit'); // lämnar hemmet
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(1);
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('alarm_1', 'FIRED_LOCALLY');
  });

  it('"kommer fram" skapat när man redan är på platsen larmar först efter att man lämnat och kommit tillbaka', async () => {
    activeAlarms(locationAlarm('ENTER_LOCATION'));
    osHasRegions(home);

    await event('enter');
    await event('enter'); // dubblett
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();

    await event('exit');
    await event('enter');
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(1);
  });

  it('sparar läget även när inga larm är aktiva för zonen', async () => {
    activeAlarms();
    await event('enter');
    expect(db.setRegionState).toHaveBeenCalledWith(home.id, 'INSIDE');
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();
  });
});

describe('omregistrering nollställer sparat läge', () => {
  it('känt OUTSIDE → omregistrering → initialt INSIDE larmar inte', async () => {
    const arrive = locationAlarm('ENTER_LOCATION');
    activeAlarms(arrive);
    mockRegionStates.set(home.id, 'OUTSIDE');

    await syncGeofencesWithOs(); // task saknas → registreras
    expect(Location.startGeofencingAsync).toHaveBeenCalledTimes(1);

    await event('enter'); // OS lägesbesked efter registrering
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();
    expect(mockRegionStates.get(home.id)).toBe('INSIDE');
  });

  it('ändrad radie för samma plats-ID: första beskedet etablerar bara läget', async () => {
    const bigger = { ...home, radius: 500 };
    activeAlarms(locationAlarm('ENTER_LOCATION', { location: bigger }));
    osHasRegions(home); // OS har den gamla radien
    mockRegionStates.set(home.id, 'OUTSIDE');

    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).toHaveBeenCalledTimes(1);

    await event('enter', bigger); // nu innanför den större cirkeln, utan att ha rört sig
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();
  });

  it('task saknas i OS men databasen har känt läge: omregistreringen börjar från UNKNOWN', async () => {
    activeAlarms(locationAlarm('EXIT_LOCATION'));
    mockRegionStates.set(home.id, 'INSIDE');

    await syncGeofencesWithOs();
    expect(db.clearRegionStates).toHaveBeenCalledWith([home.id]);

    await event('exit'); // lägesbesked, inte en utpassering
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();
  });

  it('ny plats läggs till: befintliga zoners lägesbesked larmar inte', async () => {
    const leaveHome = locationAlarm('EXIT_LOCATION');
    const arriveWork = locationAlarm('ENTER_LOCATION', { id: 'alarm_2', location: work });
    osHasRegions(home);
    mockRegionStates.set(home.id, 'INSIDE');
    activeAlarms(leaveHome, arriveWork);

    await syncGeofencesWithOs(); // hela listan registreras om
    expect(Location.startGeofencingAsync).toHaveBeenCalledTimes(1);

    await event('exit', home); // telefonens nya besked för Hem, t.ex. efter GPS-drift
    await event('enter', work); // besked för Jobb (redan på jobbet)
    expect(notif.fireGeofenceNotification).not.toHaveBeenCalled();
  });

  it('oförändrade zoner registreras inte om och behåller sitt läge', async () => {
    activeAlarms(locationAlarm('EXIT_LOCATION'));
    osHasRegions(home);
    mockRegionStates.set(home.id, 'INSIDE');

    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).not.toHaveBeenCalled();
    expect(db.clearRegionStates).not.toHaveBeenCalled();

    await event('exit');
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(1);
  });
});

describe('flera larm på samma plats', () => {
  it('olika riktning: rätt larm utlöses vid varje passage', async () => {
    const leave = locationAlarm('EXIT_LOCATION', { id: 'leave' });
    const arrive = locationAlarm('ENTER_LOCATION', { id: 'arrive' });
    activeAlarms(leave, arrive);
    osHasRegions(home);
    mockRegionStates.set(home.id, 'INSIDE');

    await event('exit');
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(1);
    expect(notif.fireGeofenceNotification).toHaveBeenCalledWith(leave, false);

    activeAlarms(arrive); // "leave" har utlösts
    await event('enter');
    expect(notif.fireGeofenceNotification).toHaveBeenCalledTimes(2);
    expect(notif.fireGeofenceNotification).toHaveBeenLastCalledWith(arrive, true);
  });

  it('samma riktning: båda larmen utlöses av samma passage', async () => {
    const a = locationAlarm('EXIT_LOCATION', { id: 'a' });
    const b = locationAlarm('EXIT_LOCATION', { id: 'b' });
    activeAlarms(a, b);
    osHasRegions(home);
    mockRegionStates.set(home.id, 'INSIDE');

    await event('exit');
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('a', 'FIRED_LOCALLY');
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('b', 'FIRED_LOCALLY');
  });

  it('delar en enda fysisk zon', async () => {
    activeAlarms(
      locationAlarm('EXIT_LOCATION', { id: 'a' }),
      locationAlarm('ENTER_LOCATION', { id: 'b' })
    );
    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).toHaveBeenCalledWith(expect.any(String), [
      expect.objectContaining({ identifier: home.id }),
    ]);
  });

  it('platsgränsen räknar unika platser, inte larm', () => {
    const many = Array.from({ length: 30 }, (_, i) => locationAlarm('EXIT_LOCATION', { id: `a${i}` }));
    activeAlarms(...many);
    expect(() => assertCanAddGeofence(locationAlarm('ENTER_LOCATION', { id: 'new' }))).not.toThrow();
  });
});

describe('syncGeofencesWithOs', () => {
  it('registrerar båda riktningarna för varje zon', async () => {
    activeAlarms(locationAlarm('EXIT_LOCATION'));
    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).toHaveBeenCalledWith(expect.any(String), [
      expect.objectContaining({ identifier: home.id, notifyOnEnter: true, notifyOnExit: true }),
    ]);
    expect(db.pruneRegionStates).toHaveBeenCalledWith([home.id]);
  });

  it('registrerar om äldre zoner som bara bevakade en riktning', async () => {
    activeAlarms(locationAlarm('EXIT_LOCATION'));
    m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    m(TaskManager.getTaskOptionsAsync).mockResolvedValue({
      regions: [{ ...osRegion(home), notifyOnEnter: false }],
    });
    await syncGeofencesWithOs();
    expect(Location.startGeofencingAsync).toHaveBeenCalledTimes(1);
  });

  it('stoppar bevakningen och rensar lägen när inga platslarm finns', async () => {
    activeAlarms();
    m(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    await syncGeofencesWithOs();
    expect(Location.stopGeofencingAsync).toHaveBeenCalled();
    expect(db.pruneRegionStates).toHaveBeenCalledWith([]);
  });
});
