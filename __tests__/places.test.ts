jest.mock('../src/services/db', () => ({
  deletePlace: jest.fn(),
  findActiveAlarmsByLocationId: jest.fn(() => []),
  getPlace: jest.fn(),
  getPlaces: jest.fn(() => []),
  restorePlaceAndAlarms: jest.fn(),
  savePlace: jest.fn(),
  savePlaceAndActiveAlarms: jest.fn(() => []),
}));
jest.mock('../src/services/geofence', () => ({ syncGeofencesWithOs: jest.fn(async () => 1) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));

/* eslint-disable import/first */
import { locationFromPlace, validatePlace } from '../src/logic/places';
import * as db from '../src/services/db';
import * as geo from '../src/services/geofence';
import { createPlace, updatePlace } from '../src/services/places';
import { LocalAlarm, SavedPlace } from '../src/types';
/* eslint-enable import/first */

const hemma: SavedPlace = {
  id: 'place_hemma',
  name: 'Hemma',
  latitude: 59.3,
  longitude: 18.0,
  radius: 150,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const input = { name: 'Jobbet', latitude: 59.33, longitude: 18.06, radius: 200 };

beforeEach(() => {
  jest.clearAllMocks();
  (db.getPlaces as jest.Mock).mockReturnValue([hemma]);
  (db.getPlace as jest.Mock).mockReturnValue(hemma);
  (db.savePlaceAndActiveAlarms as jest.Mock).mockReturnValue([]);
  (geo.syncGeofencesWithOs as jest.Mock).mockResolvedValue(1);
});

describe('validatePlace', () => {
  it('godkänner en giltig plats', () => {
    expect(validatePlace(input, [hemma])).toBeNull();
  });

  it.each([
    ['tomt namn', { ...input, name: '  ' }, /namn/],
    ['för långt namn', { ...input, name: 'x'.repeat(41) }, /högst 40/],
    ['upptaget namn (skiftläge spelar ingen roll)', { ...input, name: ' hemma ' }, /redan en plats/],
    ['ogiltiga koordinater', { ...input, latitude: NaN }, /Välj var/],
    ['för liten radie', { ...input, radius: 50 }, /Radien/],
  ])('avvisar %s', (_, bad, message) => {
    expect(validatePlace(bad, [hemma])).toMatch(message);
  });

  it('platsen som redigeras får behålla sitt namn', () => {
    expect(validatePlace({ ...input, name: 'Hemma' }, [hemma], 'place_hemma')).toBeNull();
  });
});

describe('locationFromPlace', () => {
  it('använder platsens id så att larm på samma plats delar zon', () => {
    expect(locationFromPlace(hemma)).toEqual({
      id: 'place_hemma',
      name: 'Hemma',
      latitude: 59.3,
      longitude: 18.0,
      radius: 150,
    });
  });
});

describe('createPlace', () => {
  it('sparar med trimmat namn', () => {
    const place = createPlace({ ...input, name: ' Jobbet ' }, new Date('2026-09-29T10:00:00Z'));
    expect(place).toMatchObject({ name: 'Jobbet', radius: 200, createdAt: '2026-09-29T10:00:00.000Z' });
    expect(db.savePlace).toHaveBeenCalledWith(place);
  });

  it('sparar inget när platsen är ogiltig', () => {
    expect(() => createPlace({ ...input, name: 'Hemma' })).toThrow(/redan en plats/);
    expect(db.savePlace).not.toHaveBeenCalled();
  });
});

describe('updatePlace', () => {
  const activeAlarm = { id: 'alarm_1', location: locationFromPlace(hemma) } as LocalAlarm;

  it('uppdaterar platsen utan omregistrering när inga larm använder den', async () => {
    await updatePlace('place_hemma', { ...input, name: 'Hem' });
    expect(db.savePlaceAndActiveAlarms).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hem' }));
    expect(geo.syncGeofencesWithOs).not.toHaveBeenCalled();
  });

  it('registrerar om zonerna när aktiva larm följer med', async () => {
    (db.savePlaceAndActiveAlarms as jest.Mock).mockReturnValue([activeAlarm]);
    await updatePlace('place_hemma', { ...input, name: 'Hemma', radius: 500 });
    expect(geo.syncGeofencesWithOs).toHaveBeenCalledTimes(1);
    expect(db.restorePlaceAndAlarms).not.toHaveBeenCalled();
  });

  it('återställer plats och larm om OS vägrar', async () => {
    (db.savePlaceAndActiveAlarms as jest.Mock).mockReturnValue([activeAlarm]);
    (geo.syncGeofencesWithOs as jest.Mock).mockRejectedValueOnce(new Error('Tillåt alltid'));
    await expect(updatePlace('place_hemma', { ...input, name: 'Hemma' })).rejects.toThrow('Tillåt alltid');
    expect(db.restorePlaceAndAlarms).toHaveBeenCalledWith(hemma, [activeAlarm]);
    expect(geo.syncGeofencesWithOs).toHaveBeenCalledTimes(2);
  });

  it('kastar om platsen inte finns', async () => {
    (db.getPlace as jest.Mock).mockReturnValue(null);
    await expect(updatePlace('borta', input)).rejects.toThrow(/finns inte/);
  });
});
