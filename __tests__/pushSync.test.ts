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

/* eslint-disable import/first */
import * as db from '../src/services/db';
import * as geo from '../src/services/geofence';
import * as notif from '../src/services/notifications';
import {
  acceptFriendAlarm,
  extractSyncPayload,
  handleIncomingPushPayload,
  setAckTransport,
} from '../src/services/pushSync';
/* eslint-enable import/first */

const alarm = {
  id: 'remote_1',
  creatorId: 'FRIEND_1',
  content: 'Köp kaffe',
  triggerType: 'ENTER_LOCATION',
  location: { id: 'loc_1', name: 'ICA', latitude: 59.3, longitude: 18.0, radius: 150 },
};

beforeEach(() => jest.clearAllMocks());

describe('extractSyncPayload', () => {
  it('hittar payload i FCM:s dataString', () => {
    const raw = { data: { dataString: JSON.stringify({ type: 'SYNC_GEOFENCE', alarm }) } };
    expect(extractSyncPayload(raw)?.alarm).toEqual(alarm);
  });

  it('ignorerar annan data', () => {
    expect(extractSyncPayload({ data: { type: 'OTHER' } })).toBeNull();
  });
});

describe('handleIncomingPushPayload', () => {
  it('sparar som förfrågan utan att registrera geofence eller skicka ACK', async () => {
    const transport = jest.fn();
    setAckTransport(transport);
    await expect(handleIncomingPushPayload({ type: 'SYNC_GEOFENCE', alarm })).resolves.toBe(true);
    expect(db.saveAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'remote_1', status: 'PENDING_ACCEPTANCE' })
    );
    expect(notif.presentFriendRequest).toHaveBeenCalled();
    expect(geo.syncGeofencesWithOs).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
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
  it('aktiverar geofence och skickar ett ACK utan platsdata', async () => {
    (db.getAlarm as jest.Mock).mockReturnValue({ ...alarm, status: 'PENDING_ACCEPTANCE' });
    const transport = jest.fn();
    setAckTransport(transport);
    const ack = await acceptFriendAlarm('remote_1');
    expect(db.updateAlarmStatus).toHaveBeenCalledWith('remote_1', 'ACTIVE_GEOFENCE');
    expect(Object.keys(ack).sort()).toEqual(['alarmId', 'deviceTimestamp', 'status']);
    expect(transport).toHaveBeenCalledWith(ack);
  });

  it('återgår till förfrågan om OS vägrar', async () => {
    (db.getAlarm as jest.Mock).mockReturnValue({ ...alarm, status: 'PENDING_ACCEPTANCE' });
    (geo.syncGeofencesWithOs as jest.Mock).mockRejectedValueOnce(new Error('Tillåt alltid'));
    await expect(acceptFriendAlarm('remote_1')).rejects.toThrow('Tillåt alltid');
    expect(db.updateAlarmStatus).toHaveBeenLastCalledWith('remote_1', 'PENDING_ACCEPTANCE');
  });
});
