jest.mock('../src/services/alarms', () => ({}));
jest.mock('../src/services/geofence', () => ({ syncGeofencesWithOs: jest.fn(async () => 1) }));
jest.mock('../src/services/notifications', () => ({
  retryPendingAlarmCancellations: jest.fn(async () => 0),
}));
jest.mock('../src/services/pushSync', () => ({}));

/* eslint-disable import/first */
import { handleAppForeground } from '../src/services/appLifecycle';
import { syncGeofencesWithOs } from '../src/services/geofence';
import { retryPendingAlarmCancellations } from '../src/services/notifications';
/* eslint-enable import/first */

beforeEach(() => jest.clearAllMocks());

describe('handleAppForeground', () => {
  it('försöker avboka väntande larm och synkar platszoner', async () => {
    await handleAppForeground();
    expect(retryPendingAlarmCancellations).toHaveBeenCalledTimes(1);
    expect(syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });

  it('ett fel i avbokningskön stoppar inte synken av platszoner', async () => {
    (retryPendingAlarmCancellations as jest.Mock).mockRejectedValueOnce(new Error('databasfel'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(handleAppForeground()).resolves.toBeUndefined();
    expect(syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });
});
