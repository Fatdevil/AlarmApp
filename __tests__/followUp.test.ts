import { followUpLine, hasTimeReminder, isZoneArmed } from '../src/logic/followUp';
import { LocalAlarm } from '../src/types';

const at = new Date(2026, 9, 2, 16, 0);
const base: LocalAlarm = {
  id: 'a',
  creatorId: 'ME',
  recipientId: 'ME',
  content: 'Köp blommor',
  triggerType: 'EXIT_LOCATION',
  location: { id: 'place_jobb', name: 'Jobbet', latitude: 59, longitude: 18, radius: 150 },
  dateTime: at.toISOString(),
  status: 'ACTIVE_GEOFENCE',
  createdAt: 't',
};

describe('uppföljning vid plats', () => {
  it('känner igen platslarm med tid', () => {
    expect(hasTimeReminder(base)).toBe(true);
    expect(hasTimeReminder({ ...base, dateTime: null })).toBe(false);
    expect(hasTimeReminder({ ...base, triggerType: 'TIME' })).toBe(false);
  });

  it('zonen larmar först från tiden', () => {
    expect(isZoneArmed(base, new Date(at.getTime() - 60_000))).toBe(false);
    expect(isZoneArmed(base, at)).toBe(true);
    expect(isZoneArmed(base, new Date(at.getTime() + 60_000))).toBe(true);
  });

  it('vanliga platslarm larmar direkt', () => {
    expect(isZoneArmed({ ...base, dateTime: null }, new Date(0))).toBe(true);
  });

  it('beskriver uppföljningen', () => {
    expect(followUpLine(base)).toBe('Sedan: när du lämnar Jobbet');
    expect(followUpLine({ ...base, triggerType: 'ENTER_LOCATION' })).toBe('Sedan: när du kommer till Jobbet');
    expect(followUpLine({ ...base, dateTime: null })).toBeNull();
  });
});
