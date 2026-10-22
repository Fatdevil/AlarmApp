import {
  alarmKind,
  pickNext,
  placeLine,
  rowDetails,
  rowFollowUp,
  shortDay,
  shownTime,
} from '../src/logic/alarmDisplay';
import { LocalAlarm } from '../src/types';

const now = new Date(2026, 9, 22, 12, 0);
const jobbet = { id: 'p', name: 'Jobbet', latitude: 59, longitude: 18, radius: 150 };

function alarm(overrides: Partial<LocalAlarm> = {}): LocalAlarm {
  return {
    id: 'a',
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'x',
    triggerType: 'TIME',
    dateTime: new Date(2026, 9, 22, 16, 0).toISOString(),
    repeat: 'NONE',
    status: 'SCHEDULED',
    createdAt: now.toISOString(),
    notificationIds: ['n1'],
    ...overrides,
  };
}

const place = (overrides: Partial<LocalAlarm> = {}) =>
  alarm({ triggerType: 'EXIT_LOCATION', dateTime: null, location: jobbet, status: 'ACTIVE_GEOFENCE', ...overrides });

describe('alarmKind', () => {
  it('tid, plats och uppföljning före respektive efter sin tid', () => {
    expect(alarmKind(alarm(), now)).toBe('time');
    expect(alarmKind(place(), now)).toBe('place');
    expect(alarmKind(place({ dateTime: new Date(2026, 9, 24, 16).toISOString() }), now)).toBe('time');
    expect(alarmKind(place({ dateTime: new Date(2026, 9, 21, 16).toISOString() }), now)).toBe('place');
  });
});

describe('shownTime', () => {
  it('nästa ringning, eller den passerade tiden för ett larm som har ringt', () => {
    expect(shownTime(alarm(), now)).toEqual(new Date(2026, 9, 22, 16, 0));
    const fired = alarm({ status: 'FIRED_LOCALLY', dateTime: new Date(2026, 9, 22, 7, 15).toISOString() });
    expect(shownTime(fired, now)).toEqual(new Date(2026, 9, 22, 7, 15));
    expect(shownTime(place(), now)).toBeNull();
  });
});

describe('rader', () => {
  it('platsrad beskriver riktningen', () => {
    expect(placeLine(place())).toBe('När du lämnar Jobbet');
    expect(placeLine(place({ triggerType: 'ENTER_LOCATION' }))).toBe('När du kommer till Jobbet');
  });

  it('detaljer: upprepning, plats, checklista, väntande', () => {
    expect(rowDetails(alarm({ repeat: 'WEEKDAYS' }), now)).toEqual(['Vardagar']);
    expect(
      rowDetails(
        place({
          checklistItems: [
            { id: '1', text: 'a', done: true },
            { id: '2', text: 'b', done: false },
          ],
        }),
        now
      )
    ).toEqual(['När du lämnar Jobbet', '1 av 2']);
    expect(rowDetails(alarm({ notificationIds: [] }), now)).toEqual(['läggs in när appen öppnas närmare tiden']);
  });

  it('uppföljningen visas bara före sin tid', () => {
    const followUp = place({ dateTime: new Date(2026, 9, 24, 16).toISOString() });
    expect(rowFollowUp(followUp, now)).toBe('Sedan: när du lämnar Jobbet');
    expect(rowFollowUp(place(), now)).toBeNull();
  });

  it('kort dag under klockslaget, inget för idag', () => {
    expect(shortDay(new Date(2026, 9, 22, 18), now)).toBeNull();
    expect(shortDay(new Date(2026, 9, 23, 7), now)).toBe('imorgon');
  });
});

describe('pickNext', () => {
  it('väljer den som ringer först, uppföljningar inräknade', () => {
    const later = alarm({ id: 'senare', dateTime: new Date(2026, 9, 25, 9).toISOString() });
    const followUp = place({ id: 'uppföljning', dateTime: new Date(2026, 9, 22, 14).toISOString() });
    expect(pickNext([later, alarm(), followUp, place({ id: 'plats' })], now)?.id).toBe('uppföljning');
  });

  it('ingen när inget ringer vid en tid', () => {
    expect(pickNext([place(), alarm({ status: 'DONE' })], now)).toBeNull();
  });
});
