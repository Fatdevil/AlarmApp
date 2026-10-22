import { summarize, SummaryPart } from '../src/logic/reminderSummary';

const now = new Date(2026, 9, 22, 12, 0);
const text = (parts: SummaryPart[]) => parts.map((p) => p.text).join('');

describe('summarize', () => {
  it('engångslarm', () => {
    const parts = summarize({ triggerType: 'TIME', at: new Date(2026, 9, 30, 16), repeat: 'NONE', placeName: null }, now);
    expect(text(parts)).toBe('Ringer fre 30 okt 16:00.');
    expect(parts.find((p) => p.tone === 'time')?.text).toBe('fre 30 okt 16:00');
  });

  it('idag och upprepning', () => {
    expect(text(summarize({ triggerType: 'TIME', at: new Date(2026, 9, 22, 18), repeat: 'NONE', placeName: null }, now))).toBe(
      'Ringer idag 18:00.'
    );
    expect(
      text(summarize({ triggerType: 'TIME', at: new Date(2026, 9, 23, 7, 15), repeat: 'WEEKDAYS', placeName: null }, now))
    ).toBe('Ringer vardagar kl. 07:15.');
  });

  it('tid följd av plats', () => {
    const parts = summarize(
      { triggerType: 'TIME', at: new Date(2026, 9, 30, 16), repeat: 'NONE', placeName: 'Jobbet', followUpType: 'EXIT_LOCATION' },
      now
    );
    expect(text(parts)).toBe('Ringer fre 30 okt 16:00. Sedan när du lämnar Jobbet.');
    expect(parts.find((p) => p.tone === 'place')?.text).toBe('lämnar Jobbet');
  });

  it('platslarm, med och utan vald plats', () => {
    const at = new Date(2026, 9, 30, 16);
    expect(text(summarize({ triggerType: 'ENTER_LOCATION', at, repeat: 'NONE', placeName: 'ICA' }, now))).toBe(
      'Påminner när du kommer till ICA.'
    );
    expect(text(summarize({ triggerType: 'EXIT_LOCATION', at, repeat: 'NONE', placeName: null }, now))).toBe('Välj en plats.');
  });
});
