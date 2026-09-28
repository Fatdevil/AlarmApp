/**
 * Tolkning av platshändelser.
 *
 * expo-location levererar telefonens första lägesbesked för en zon (direkt efter
 * registrering, efter omstart och när appen startas om av systemet) som en vanlig
 * Enter/Exit-händelse – utan att skilja den från en verklig gränspassage. Därför
 * sparas senast kända läge per zon, och bara en ändring från ett känt läge räknas
 * som en passage:
 *
 *   UNKNOWN → INSIDE/OUTSIDE  = lägesbesked, larmar aldrig
 *   INSIDE  → OUTSIDE         = utpassering
 *   OUTSIDE → INSIDE          = ankomst
 *   samma läge igen           = dubblett, larmar aldrig
 */
import { TriggerType } from '../types';

export type RegionState = 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
export type ObservedRegionState = Exclude<RegionState, 'UNKNOWN'>;

export interface RegionDefinition {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
}

/** Är händelsen en verklig passage i den riktning larmet väntar på? */
export function isTriggeringTransition(
  previous: RegionState,
  observed: ObservedRegionState,
  triggerType: TriggerType
): boolean {
  if (previous === 'UNKNOWN' || previous === observed) return false;
  if (triggerType === 'ENTER_LOCATION') return observed === 'INSIDE';
  if (triggerType === 'EXIT_LOCATION') return observed === 'OUTSIDE';
  return false;
}

function regionKey(r: RegionDefinition): string {
  // OS-standard för saknade riktningar är true (expo-location)
  const enter = r.notifyOnEnter ?? true;
  const exit = r.notifyOnExit ?? true;
  return `${r.identifier}|${r.latitude}|${r.longitude}|${r.radius}|${enter}|${exit}`;
}

/**
 * Samma zoner (oavsett ordning)? Varje omregistrering får OS att skicka nya
 * lägesbesked för alla zoner, så den ska bara göras när uppsättningen ändrats.
 */
export function sameRegions(a: readonly RegionDefinition[], b: readonly RegionDefinition[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(regionKey));
  return b.every((r) => keys.has(regionKey(r)));
}
