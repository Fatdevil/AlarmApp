import { validateIncomingAlarm } from '../src/logic/validation';

const nowIso = '2026-09-23T10:00:00.000Z';

const valid = {
  id: 'remote_123',
  creatorId: 'FRIEND_1',
  content: 'Köp kaffe',
  triggerType: 'ENTER_LOCATION',
  location: { id: 'loc_1', name: 'ICA', latitude: 59.33, longitude: 18.06, radius: 150 },
};

describe('validateIncomingAlarm', () => {
  it('godkänner en korrekt payload och kräver mottagarens godkännande', () => {
    const r = validateIncomingAlarm(valid, nowIso);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.alarm.status).toBe('PENDING_ACCEPTANCE');
      expect(r.alarm.recipientId).toBe('ME');
    }
  });

  it('släpper inte igenom okända fält', () => {
    const r = validateIncomingAlarm({ ...valid, status: 'DONE', evil: '<script>' }, nowIso);
    expect(r.ok && Object.keys(r.alarm)).not.toContain('evil');
    expect(r.ok && r.alarm.status).toBe('PENDING_ACCEPTANCE');
  });

  it.each([
    ['radie under 100 m', { ...valid, location: { ...valid.location, radius: 50 } }],
    ['orimlig radie', { ...valid, location: { ...valid.location, radius: 100_000 } }],
    ['ogiltig latitud', { ...valid, location: { ...valid.location, latitude: 200 } }],
    ['NaN-koordinat', { ...valid, location: { ...valid.location, longitude: NaN } }],
    ['tidslarm', { ...valid, triggerType: 'TIME' }],
    ['tom text', { ...valid, content: '   ' }],
    ['ogiltigt id', { ...valid, id: '../../etc' }],
    ['saknad plats', { ...valid, location: undefined }],
    ['inte ett objekt', 'hej'],
  ])('avvisar %s', (_, payload) => {
    expect(validateIncomingAlarm(payload, nowIso).ok).toBe(false);
  });

  it('nollställer checklistepunkter till ej klara', () => {
    const r = validateIncomingAlarm(
      { ...valid, checklistItems: [{ id: 'i1', text: 'Mjölk', done: true }] },
      nowIso
    );
    expect(r.ok && r.alarm.checklistItems).toEqual([{ id: 'i1', text: 'Mjölk', done: false }]);
  });
});
