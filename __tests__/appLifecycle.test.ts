jest.mock('../src/services/alarms', () => ({}));
jest.mock('../src/services/geofence', () => ({ syncGeofencesWithOs: jest.fn(async () => 1) }));
jest.mock('../src/services/notifications', () => ({
  retryPendingAlarmCancellations: jest.fn(async () => 0),
}));
jest.mock('../src/services/pushSync', () => ({}));
jest.mock('../src/services/notificationBudget', () => ({
  rebalanceNotificationBudget: jest.fn(async () => ({ added: 0, removed: 0 })),
}));

/* eslint-disable import/first */
import { handleAppForeground } from '../src/services/appLifecycle';
import { syncGeofencesWithOs } from '../src/services/geofence';
import { rebalanceNotificationBudget } from '../src/services/notificationBudget';
import { retryPendingAlarmCancellations } from '../src/services/notifications';
/* eslint-enable import/first */

beforeEach(() => jest.clearAllMocks());

describe('handleAppForeground', () => {
  it('försöker avboka väntande larm, fyller på notisschemat och synkar platszoner', async () => {
    await handleAppForeground();
    expect(retryPendingAlarmCancellations).toHaveBeenCalledTimes(1);
    expect(rebalanceNotificationBudget).toHaveBeenCalledTimes(1);
    expect(syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });

  it('ett fel i avbokningskön stoppar inte synken av platszoner', async () => {
    (retryPendingAlarmCancellations as jest.Mock).mockRejectedValueOnce(new Error('databasfel'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(handleAppForeground()).resolves.toBeUndefined();
    expect(syncGeofencesWithOs).toHaveBeenCalledTimes(1);
  });
});
