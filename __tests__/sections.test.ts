import { buildSections, classifyAlarm } from '../src/logic/sections';
import { LocalAlarm } from '../src/types';

const now = new Date(2026, 8, 23, 12, 0);

function timeAlarm(overrides: Partial<LocalAlarm>): LocalAlarm {
  return {
    id: 'a',
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'x',
    triggerType: 'TIME',
    status: 'SCHEDULED',
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe('classifyAlarm', () => {
  it('ett passerat engångslarm från igår hamnar under "Har ringt", inte "Kommande"', () => {
    const a = timeAlarm({ dateTime: new Date(2026, 8, 22, 9, 0).toISOString() });
    expect(classifyAlarm(a, now)).toBe('attention');
  });

  it('senare idag → idag, imorgon → kommande', () => {
    expect(classifyAlarm(timeAlarm({ dateTime: new Date(2026, 8, 23, 18).toISOString() }), now)).toBe('today');
    expect(classifyAlarm(timeAlarm({ dateTime: new Date(2026, 8, 24, 9).toISOString() }), now)).toBe('upcoming');
  });

  it('dagligt larm vars tid passerat idag är kommande (imorgon)', () => {
    const a = timeAlarm({ dateTime: new Date(2026, 8, 1, 9).toISOString(), repeat: 'DAILY' });
    expect(classifyAlarm(a, now)).toBe('upcoming');
  });

  it('statusar', () => {
    expect(classifyAlarm(timeAlarm({ status: 'PENDING_ACCEPTANCE' }), now)).toBe('requests');
    expect(classifyAlarm(timeAlarm({ status: 'MISSED' }), now)).toBe('attention');
    expect(classifyAlarm(timeAlarm({ status: 'DONE' }), now)).toBe('done');
    expect(
      classifyAlarm(timeAlarm({ status: 'ACTIVE_GEOFENCE', triggerType: 'ENTER_LOCATION' }), now)
    ).toBe('places');
  });
});

describe('buildSections', () => {
  it('sorterar tidslarm efter nästa ringning och utelämnar tomma sektioner', () => {
    const sections = buildSections(
      [
        timeAlarm({ id: 'late', dateTime: new Date(2026, 8, 23, 20).toISOString() }),
        timeAlarm({ id: 'early', dateTime: new Date(2026, 8, 23, 13).toISOString() }),
      ],
      now
    );
    expect(sections.map((s) => s.key)).toEqual(['today']);
    expect(sections[0].data.map((a) => a.id)).toEqual(['early', 'late']);
  });
});
