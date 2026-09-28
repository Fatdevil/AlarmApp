jest.mock('../src/services/alarms', () => ({}));
jest.mock('../src/services/geofence', () => ({ syncGeofencesWithOs: jest.fn(async () => 1) }));
jest.mock('../src/services/notifications', () => ({}));
jest.mock('../src/services/pushSync', () => ({}));
jest.mock('../src/services/wake', () => ({ reconcileWakeAlarms: jest.fn(async () => 0) }));

/* eslint-disable import/first */
import { handleAppForeground } from '../src/services/appLifecycle';
import { syncGeofencesWithOs } from '../src/services/geofence';
import { reconcileWakeAlarms } from '../src/services/wake';
/* eslint-enable import/first */

beforeEach(() => jest.clearAllMocks());

describe('handleAppForeground', () => {
  it('synkar platszoner – t.ex. när platsbehörighet getts i Inställningar', async () => {
    await handleAppForeground();
    expect(reconcileWakeAlarms).toHaveBeenCalledTimes(1);
    expect(syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });

  it('ett fel i väckningen stoppar inte synken av platszoner', async () => {
    (reconcileWakeAlarms as jest.Mock).mockRejectedValueOnce(new Error('fel'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(handleAppForeground()).resolves.toBeUndefined();
    expect(syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });
});
