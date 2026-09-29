import { isTriggeringTransition, RegionDefinition, sameRegions } from '../src/logic/regionState';

describe('isTriggeringTransition', () => {
  it('lägesbesked från okänt läge larmar aldrig', () => {
    expect(isTriggeringTransition('UNKNOWN', 'OUTSIDE', 'EXIT_LOCATION')).toBe(false);
    expect(isTriggeringTransition('UNKNOWN', 'INSIDE', 'ENTER_LOCATION')).toBe(false);
  });

  it('dubbletter av samma läge larmar inte', () => {
    expect(isTriggeringTransition('OUTSIDE', 'OUTSIDE', 'EXIT_LOCATION')).toBe(false);
    expect(isTriggeringTransition('INSIDE', 'INSIDE', 'ENTER_LOCATION')).toBe(false);
  });

  it('verklig utpassering och ankomst larmar', () => {
    expect(isTriggeringTransition('INSIDE', 'OUTSIDE', 'EXIT_LOCATION')).toBe(true);
    expect(isTriggeringTransition('OUTSIDE', 'INSIDE', 'ENTER_LOCATION')).toBe(true);
  });

  it('passage åt fel håll larmar inte', () => {
    expect(isTriggeringTransition('OUTSIDE', 'INSIDE', 'EXIT_LOCATION')).toBe(false);
    expect(isTriggeringTransition('INSIDE', 'OUTSIDE', 'ENTER_LOCATION')).toBe(false);
    expect(isTriggeringTransition('INSIDE', 'OUTSIDE', 'TIME')).toBe(false);
  });
});

describe('sameRegions', () => {
  const a: RegionDefinition = { identifier: 'a', latitude: 59, longitude: 18, radius: 200 };
  const b: RegionDefinition = { identifier: 'b', latitude: 58, longitude: 17, radius: 150 };

  it('ordningen spelar ingen roll', () => {
    expect(sameRegions([a, b], [b, a])).toBe(true);
  });

  it('ändrad radie, ny zon eller borttagen zon räknas som ändring', () => {
    expect(sameRegions([a, b], [a, { ...b, radius: 300 }])).toBe(false);
    expect(sameRegions([a], [a, b])).toBe(false);
    expect(sameRegions([a, b], [a])).toBe(false);
  });

  it('ändrade riktningar räknas som ändring (äldre registreringar bevakade bara en)', () => {
    const both = { ...a, notifyOnEnter: true, notifyOnExit: true };
    expect(sameRegions([{ ...a, notifyOnEnter: false, notifyOnExit: true }], [both])).toBe(false);
    expect(sameRegions([a], [both])).toBe(true);
  });
});
