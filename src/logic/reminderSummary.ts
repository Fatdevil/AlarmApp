/**
 * Meningen längst ned i "Ny påminnelse" som säger vad som kommer att hända
 * (ren logik, testas i __tests__/reminderSummary.test.ts).
 */
import { RepeatRule, TriggerType } from '../types';
import { formatClock, formatDayLabel } from './time';

export interface SummaryInput {
  triggerType: TriggerType;
  /** När tidslarmet ringer första gången (tid och uppföljning). */
  at: Date;
  repeat: RepeatRule;
  /** Platsen för platslarm, eller uppföljningens plats för ett tidslarm. */
  placeName: string | null;
  followUpType?: 'ENTER_LOCATION' | 'EXIT_LOCATION' | null;
}

export interface SummaryPart {
  text: string;
  /** Markeras: tid i orange, plats i blått, annars vanlig text. */
  tone?: 'time' | 'place';
}

function direction(type: TriggerType | null | undefined, place: string): string {
  return type === 'ENTER_LOCATION' ? `kommer till ${place}` : `lämnar ${place}`;
}

export function summarize(input: SummaryInput, now: Date = new Date()): SummaryPart[] {
  const { triggerType, at, repeat, placeName, followUpType } = input;

  if (triggerType !== 'TIME') {
    if (!placeName) return [{ text: 'Välj en plats.' }];
    return [{ text: 'Påminner när du ' }, { text: direction(triggerType, placeName), tone: 'place' }, { text: '.' }];
  }

  const when =
    repeat === 'NONE'
      ? // "fre 30 okt." → "fre 30 okt" så att meningens egen punkt inte blir dubbel
        `${formatDayLabel(at, now).toLowerCase().replace(/\.$/, '')} ${formatClock(at)}`
      : `${repeat === 'DAILY' ? 'varje dag' : 'vardagar'} kl. ${formatClock(at)}`;
  const parts: SummaryPart[] = [{ text: 'Ringer ' }, { text: when, tone: 'time' }, { text: '.' }];
  if (followUpType && placeName) {
    parts.push({ text: ' Sedan när du ' }, { text: direction(followUpType, placeName), tone: 'place' }, { text: '.' });
  }
  return parts;
}
