import { LocalAlarm } from '../src/types';

jest.mock('../src/services/db', () => ({
  saveAlarm: jest.fn(),
  deleteAlarm: jest.fn(),
  getAlarm: jest.fn(),
  getAlarmsByStatus: jest.fn(() => []),
  setNotificationIds: jest.fn(),
  updateAlarmStatus: jest.fn(),
}));
jest.mock('../src/services/notifications', () => ({
  scheduleTimeAlarm: jest.fn(),
  scheduleSnooze: jest.fn(),
  cancelNotifications: jest.fn(),
  getScheduledByAlarm: jest.fn(async () => new Map()),
}));
jest.mock('../src/services/geofence', () => ({
  assertCanAddGeofence: jest.fn(),
  syncGeofencesWithOs: jest.fn(async () => 1),
}));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));

/* eslint-disable import/first */
import * as db from '../src/services/db';
import * as geo from '../src/services/geofence';
import * as notif from '../src/services/notifications';
import {
  acknowledgeAlarm,
  completeAlarm,
  createAlarm,
  reconcileScheduledAlarms,
  restoreAlarm,
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

beforeEach(() => jest.clearAllMocks());

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

  it('avbryter OS-notisen om databasskrivningen misslyckas', async () => {
    m(notif.scheduleTimeAlarm).mockResolvedValue(['n1']);
    m(db.saveAlarm).mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(createAlarm(alarm())).rejects.toThrow('disk full');
    expect(notif.cancelNotifications).toHaveBeenCalledWith(['n1']);
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
