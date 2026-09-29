import { LocalAlarm } from '../src/types';

jest.mock('../src/services/db', () => ({
  saveAlarm: jest.fn(),
  deleteAlarm: jest.fn(),
  getAlarm: jest.fn(),
  getAlarmsByStatus: jest.fn(() => []),
  getPlace: jest.fn(() => null),
  setNotificationIds: jest.fn(),
  updateAlarmStatus: jest.fn(),
}));
jest.mock('../src/services/notifications', () => ({
  scheduleTimeAlarm: jest.fn(),
  scheduleSnooze: jest.fn(),
  cancelNotifications: jest.fn(),
  cancelNotificationsBestEffort: jest.fn(),
  getScheduledByAlarm: jest.fn(async () => new Map()),
  isNotificationBudgetLimited: jest.fn(async () => false),
}));
jest.mock('../src/services/notificationBudget', () => ({
  rebalanceNotificationBudget: jest.fn(async () => ({ added: 0, removed: 0 })),
  shouldDeferScheduling: jest.fn(async () => false),
}));
jest.mock('../src/services/geofence', () => ({
  assertCanAddGeofence: jest.fn(),
  syncGeofencesWithOs: jest.fn(async () => 1),
}));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));

/* eslint-disable import/first */
import * as db from '../src/services/db';
import * as geo from '../src/services/geofence';
import * as budget from '../src/services/notificationBudget';
import * as notif from '../src/services/notifications';
import {
  acknowledgeAlarm,
  completeAlarm,
  createAlarm,
  reconcileScheduledAlarms,
  removeAlarm,
  restoreAlarm,
  snoozeAlarm,
} from '../src/services/alarms';
/* eslint-enable import/first */

const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;

const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 3600_000).toISOString();

function alarm(overrides: Partial<LocalAlarm> = {}): LocalAlarm {
  return {
    id: 'alarm_1',
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'Test',
    triggerType: 'TIME',
    dateTime: future,
    repeat: 'NONE',
    status: 'SCHEDULED',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const place = { id: 'loc_1', name: 'Hem', latitude: 59, longitude: 18, radius: 150 };

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks behåller implementationer – nollställ den som tester byter ut
  m(db.getAlarmsByStatus).mockImplementation(() => []);
});

describe('createAlarm (tid)', () => {
  it('schemalägger i OS först och sparar sedan med notis-ID:n', async () => {
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n1']);
    await createAlarm(alarm());
    expect(db.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ notificationIds: ['n1'] }));
    expect(m(notif.scheduleTimeAlarm).mock.invocationCallOrder[0]).toBeLessThan(
      m(db.saveAlarm).mock.invocationCallOrder[0]
    );
  });

  it('sparar ingenting om schemaläggningen misslyckas (inga spöklarm)', async () => {
    m(notif.scheduleTimeAlarm).mockRejectedValue(new Error('Tiden har redan passerat'));
    await expect(createAlarm(alarm({ dateTime: past }))).rejects.toThrow('passerat');
    expect(db.saveAlarm).not.toHaveBeenCalled();
  });

  it('raderar inte larmet om det inte gick att avbryta i OS', async () => {
    m(db.getAlarm).mockReturnValue(alarm({ notificationIds: ['n1'] }));
    m(notif.cancelNotifications).mockRejectedValueOnce(new Error('OS svarar inte'));
    await expect(removeAlarm('alarm_1')).rejects.toThrow('OS svarar inte');
    expect(db.deleteAlarm).not.toHaveBeenCalled();
  });

  it('avbryter OS-notisen om databasskrivningen misslyckas', async () => {
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n1']);
    m(db.saveAlarm).mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(createAlarm(alarm())).rejects.toThrow('disk full');
    expect(notif.cancelNotificationsBestEffort).toHaveBeenCalledWith(['n1']);
  });
});

describe('createAlarm (plats)', () => {
  it('rullar tillbaka databasen om OS vägrar registrera zonen', async () => {
    m(geo.syncGeofencesWithOs)
      .mockRejectedValueOnce(new Error('Behörighet saknas'))
      .mockResolvedValueOnce(0);
    await expect(
      createAlarm(alarm({ triggerType: 'ENTER_LOCATION', dateTime: null, location: place }))
    ).rejects.toThrow('Behörighet');
    expect(db.saveAlarm).toHaveBeenCalled();
    expect(db.deleteAlarm).toHaveBeenCalledWith('alarm_1');
  });

  it('sparar inte alls om zongränsen är nådd', async () => {
    m(geo.assertCanAddGeofence).mockImplementationOnce(() => {
      throw new Error('högst 20');
    });
    await expect(
      createAlarm(alarm({ triggerType: 'ENTER_LOCATION', dateTime: null, location: place }))
    ).rejects.toThrow('högst 20');
    expect(db.saveAlarm).not.toHaveBeenCalled();
  });
});

describe('completeAlarm + restoreAlarm (ångra)', () => {
  it('avbryter notiser och kan återställas med ny schemaläggning', async () => {
    const original = alarm({ notificationIds: ['n1'] });
    m(db.getAlarm).mockReturnValue(original);
    const snapshot = await completeAlarm('alarm_1');
    expect(notif.cancelNotifications).toHaveBeenCalledWith(['n1']);
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('alarm_1', 'DONE', expect.any(String));

    m(notif.scheduleTimeAlarm).mockResolvedValue(['n2']);
    await restoreAlarm(snapshot!);
    expect(db.saveAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SCHEDULED', notificationIds: ['n2'] })
    );
  });

  it('ett engångslarm vars tid passerat återställs som "har ringt"', async () => {
    await restoreAlarm(alarm({ dateTime: past }));
    expect(notif.scheduleTimeAlarm).not.toHaveBeenCalled();
    expect(db.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ status: 'FIRED_LOCALLY' }));
  });
});

describe('restoreAlarm för platslarm', () => {
  const jobbet = { id: 'place_1', name: 'Jobbet', latitude: 59.3, longitude: 18.0, radius: 150 };
  const geoAlarm = alarm({
    triggerType: 'EXIT_LOCATION',
    dateTime: null,
    location: jobbet,
    status: 'ACTIVE_GEOFENCE',
  });

  it('använder den sparade platsen om den flyttats sedan raderingen', async () => {
    const moved = { ...jobbet, latitude: 59.4, radius: 300, createdAt: 't' };
    m(db.getPlace).mockReturnValueOnce(moved);
    await restoreAlarm(geoAlarm);
    expect(db.getPlace).toHaveBeenCalledWith('place_1');
    expect(db.saveAlarm).toHaveBeenCalledWith(
      expect.objectContaining({
        location: { id: 'place_1', name: 'Jobbet', latitude: 59.4, longitude: 18.0, radius: 300 },
      })
    );
    expect(geo.syncGeofencesWithOs).toHaveBeenCalled();
  });

  it('behåller sin kopia om platsen har raderats', async () => {
    await restoreAlarm(geoAlarm);
    expect(db.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ location: jobbet }));
  });
});

describe('reconcileScheduledAlarms', () => {
  it('skiljer på "har ringt" och "missat" för passerade larm', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([
      alarm({ id: 'rang', dateTime: past, notificationIds: ['n1'] }),
      alarm({ id: 'never', dateTime: past, notificationIds: [] }),
    ]);
    const r = await reconcileScheduledAlarms();
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('rang', 'FIRED_LOCALLY');
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('never', 'MISSED');
    expect(r).toEqual({ rescheduled: 0, fired: 1, missed: 1 });
  });

  it('schemalägger om framtida larm som saknas i OS, men dubblerar inte befintliga', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([
      alarm({ id: 'missing' }),
      alarm({ id: 'present', notificationIds: ['n9'] }),
    ]);
    m(notif.getScheduledByAlarm).mockResolvedValue(new Map([['present', ['n9']]]));
    m(notif.scheduleTimeAlarm).mockResolvedValue(['new']);
    const r = await reconcileScheduledAlarms();
    expect(notif.scheduleTimeAlarm).toHaveBeenCalledTimes(1);
    expect(db.setNotificationIds).toHaveBeenCalledWith('missing', ['new']);
    expect(r.rescheduled).toBe(1);
  });
});

describe('uppföljning vid plats (tid → plats)', () => {
  const followUp = () =>
    alarm({ triggerType: 'EXIT_LOCATION', dateTime: future, location: place, status: 'ACTIVE_GEOFENCE' });

  it('schemalägger tidspåminnelsen och registrerar zonen direkt', async () => {
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n1']);
    const saved = await createAlarm(followUp());
    expect(notif.scheduleTimeAlarm).toHaveBeenCalledWith(expect.objectContaining({ repeat: 'NONE' }));
    expect(saved).toMatchObject({ status: 'ACTIVE_GEOFENCE', notificationIds: ['n1'] });
    expect(geo.syncGeofencesWithOs).toHaveBeenCalled();
  });

  it('avbokar tidspåminnelsen och raderar larmet om zonen inte kan registreras', async () => {
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n1']);
    m(geo.syncGeofencesWithOs)
      .mockRejectedValueOnce(new Error('Tillåt alltid'))
      .mockResolvedValueOnce(0);
    await expect(createAlarm(followUp())).rejects.toThrow('Tillåt alltid');
    expect(db.deleteAlarm).toHaveBeenCalledWith('alarm_1');
    expect(notif.cancelNotificationsBestEffort).toHaveBeenCalledWith(['n1']);
  });

  it('sparar ingenting om tidspåminnelsen inte kan schemaläggas', async () => {
    m(notif.scheduleTimeAlarm).mockRejectedValueOnce(new Error('Tiden har redan passerat'));
    await expect(createAlarm(followUp())).rejects.toThrow('passerat');
    expect(db.saveAlarm).not.toHaveBeenCalled();
  });

  it('"Klar" i tidslarmet stänger både tid och plats', async () => {
    m(db.getAlarm).mockReturnValue({ ...followUp(), notificationIds: ['n1'] });
    await acknowledgeAlarm('alarm_1');
    expect(notif.cancelNotifications).toHaveBeenCalledWith(['n1']);
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('alarm_1', 'DONE', expect.any(String));
    expect(geo.syncGeofencesWithOs).toHaveBeenCalled();
  });

  it('ångra före tiden schemalägger tidspåminnelsen igen', async () => {
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n2']);
    await restoreAlarm(followUp());
    expect(db.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ notificationIds: ['n2'] }));
  });

  it('startkontrollen schemalägger om en saknad tidspåminnelse', async () => {
    m(db.getAlarmsByStatus).mockImplementation((statuses) =>
      statuses.includes('ACTIVE_GEOFENCE') ? [{ ...followUp(), notificationIds: ['borta'] }] : []
    );
    m(notif.getScheduledByAlarm).mockResolvedValueOnce(new Map());
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n3']);
    const r = await reconcileScheduledAlarms();
    expect(r.rescheduled).toBe(1);
    expect(db.setNotificationIds).toHaveBeenCalledWith('alarm_1', ['n3']);
    expect(db.updateAlarmStatus).not.toHaveBeenCalled();
  });

  it('startkontrollen rör inte en uppföljning vars tid har passerat', async () => {
    m(db.getAlarmsByStatus).mockImplementation((statuses) =>
      statuses.includes('ACTIVE_GEOFENCE') ? [{ ...followUp(), dateTime: past }] : []
    );
    await reconcileScheduledAlarms();
    expect(notif.scheduleTimeAlarm).not.toHaveBeenCalled();
    expect(db.updateAlarmStatus).not.toHaveBeenCalled();
  });

  it('ångra efter tiden återställer bara zonen', async () => {
    await restoreAlarm({ ...followUp(), dateTime: past });
    expect(notif.scheduleTimeAlarm).not.toHaveBeenCalled();
    expect(db.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ notificationIds: [] }));
  });
});

describe('acknowledgeAlarm ("Klar" i notisen)', () => {
  it('stoppar inte ett upprepat larm', async () => {
    m(db.getAlarm).mockReturnValue(alarm({ repeat: 'DAILY', notificationIds: ['n1'] }));
    await acknowledgeAlarm('alarm_1');
    expect(notif.cancelNotifications).not.toHaveBeenCalled();
    expect(db.updateAlarmStatus).not.toHaveBeenCalled();
  });

  it('markerar ett engångslarm som klart', async () => {
    m(db.getAlarm).mockReturnValue(alarm({ notificationIds: ['n1'] }));
    await acknowledgeAlarm('alarm_1');
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('alarm_1', 'DONE', expect.any(String));
  });
});

describe('snoozeAlarm', () => {
  it('ett tidslarm som har ringt blir schemalagt igen', async () => {
    m(db.getAlarm).mockReturnValue(alarm({ status: 'FIRED_LOCALLY' }));
    m(notif.scheduleSnooze).mockResolvedValue('s1');
    await snoozeAlarm('alarm_1');
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('alarm_1', 'SCHEDULED');
  });

  it('ett platslarm som har larmat förblir "har ringt"', async () => {
    m(db.getAlarm).mockReturnValue(
      alarm({ triggerType: 'EXIT_LOCATION', location: place, dateTime: null, status: 'FIRED_LOCALLY' })
    );
    m(notif.scheduleSnooze).mockResolvedValue('s1');
    await snoozeAlarm('alarm_1');
    expect(db.setNotificationIds).toHaveBeenCalledWith('alarm_1', ['s1']);
    expect(db.updateAlarmStatus).not.toHaveBeenCalled();
  });

  it('snooze av tidspåminnelsen i en uppföljning låter zonen vara aktiv', async () => {
    m(db.getAlarm).mockReturnValue(
      alarm({ triggerType: 'EXIT_LOCATION', location: place, status: 'ACTIVE_GEOFENCE', notificationIds: ['n1'] })
    );
    m(notif.scheduleSnooze).mockResolvedValue('s1');
    await snoozeAlarm('alarm_1');
    expect(db.setNotificationIds).toHaveBeenCalledWith('alarm_1', ['n1', 's1']);
    expect(db.updateAlarmStatus).not.toHaveBeenCalled();
  });
});

describe('notisbudget (iOS utan AlarmKit)', () => {
  it('ett larm som inte ryms sparas utan OS-ID:n och väntar på påfyllning', async () => {
    m(budget.shouldDeferScheduling).mockResolvedValueOnce(true);
    const saved = await createAlarm(alarm());
    expect(notif.scheduleTimeAlarm).not.toHaveBeenCalled();
    expect(saved).toMatchObject({ status: 'SCHEDULED', notificationIds: [] });
    expect(budget.rebalanceNotificationBudget).toHaveBeenCalled();
  });

  it('klar och radera fyller på schemat', async () => {
    m(db.getAlarm).mockReturnValue(alarm({ notificationIds: ['n1'] }));
    await completeAlarm('alarm_1');
    await removeAlarm('alarm_1');
    expect(budget.rebalanceNotificationBudget).toHaveBeenCalledTimes(2);
  });

  it('ett fel i påfyllningen stoppar inte "Klar"', async () => {
    m(db.getAlarm).mockReturnValue(alarm({ notificationIds: ['n1'] }));
    m(budget.rebalanceNotificationBudget).mockRejectedValueOnce(new Error('iOS'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(completeAlarm('alarm_1')).resolves.toBeTruthy();
  });

  it('startkontrollen låter påfyllningen lägga in saknade larm', async () => {
    m(notif.isNotificationBudgetLimited).mockResolvedValueOnce(true);
    m(db.getAlarmsByStatus).mockImplementation((statuses) =>
      statuses.includes('SCHEDULED') ? [alarm({ notificationIds: [] })] : []
    );
    m(budget.rebalanceNotificationBudget).mockResolvedValueOnce({ added: 1, removed: 0 });
    const r = await reconcileScheduledAlarms();
    expect(notif.scheduleTimeAlarm).not.toHaveBeenCalled();
    expect(r.rescheduled).toBe(1);
  });
});
