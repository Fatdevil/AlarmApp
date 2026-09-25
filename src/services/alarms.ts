/**
 * Larmflöden – det enda stället som ändrar larm i både databas och OS.
 * Varje operation är "allt eller inget": misslyckas OS-delen rullas databasen tillbaka.
 */
import { LocalAlarm } from '../types';
import { nextOccurrence } from '../logic/time';
import {
  deleteAlarm as dbDeleteAlarm,
  getAlarm,
  getAlarmsByStatus,
  saveAlarm,
  setNotificationIds,
  updateAlarmStatus,
} from './db';
import { logEvent } from './diagnostics';
import { assertCanAddGeofence, syncGeofencesWithOs } from './geofence';
import {
  cancelNotifications,
  getScheduledByAlarm,
  scheduleSnooze,
  scheduleTimeAlarm,
} from './notifications';

/** Sparar ett nytt larm och aktiverar det i OS. Kastar (utan sidoeffekter) vid fel. */
export async function createAlarm(alarm: LocalAlarm): Promise<LocalAlarm> {
  if (alarm.triggerType === 'TIME') {
    // Schemalägg först – då finns inget att rulla tillbaka i databasen om det misslyckas
    const notificationIds = await scheduleTimeAlarm(alarm);
    const saved: LocalAlarm = { ...alarm, status: 'SCHEDULED', notificationIds };
    try {
      saveAlarm(saved);
    } catch (err) {
      await cancelNotifications(notificationIds);
      throw err;
    }
    await logEvent('ALARM_SCHEDULED', alarm.id, {
      scheduledTime: alarm.dateTime,
      note: `Upprepning: ${alarm.repeat ?? 'NONE'}, notiser: ${notificationIds.length}`,
    });
    return saved;
  }

  const saved: LocalAlarm = { ...alarm, status: 'ACTIVE_GEOFENCE' };
  assertCanAddGeofence(saved);
  saveAlarm(saved);
  try {
    await syncGeofencesWithOs();
  } catch (err) {
    dbDeleteAlarm(saved.id);
    await syncGeofencesWithOs().catch(() => {});
    throw err;
  }
  await logEvent('GEOFENCE_REGISTERED', saved.location!.id, {
    locationSnapshot: {
      latitude: saved.location!.latitude,
      longitude: saved.location!.longitude,
      accuracy: saved.location!.radius,
    },
    note: `Radie ${saved.location!.radius} m`,
  });
  return saved;
}

async function syncGeofencesIfNeeded(alarm: LocalAlarm): Promise<void> {
  if (alarm.status === 'ACTIVE_GEOFENCE') {
    await syncGeofencesWithOs().catch((err) => console.warn('[Alarms] Geofence-synk:', err));
  }
}

/** Markerar som klart. Returnerar ögonblicksbilden före ändringen (för "Ångra"). */
export async function completeAlarm(alarmId: string): Promise<LocalAlarm | null> {
  const alarm = getAlarm(alarmId);
  if (!alarm) return null;
  await cancelNotifications(alarm.notificationIds);
  setNotificationIds(alarm.id, []);
  updateAlarmStatus(alarm.id, 'DONE', new Date().toISOString());
  await syncGeofencesIfNeeded(alarm);
  return alarm;
}

/** Raderar. Returnerar ögonblicksbilden före raderingen (för "Ångra"). */
export async function removeAlarm(alarmId: string): Promise<LocalAlarm | null> {
  const alarm = getAlarm(alarmId);
  if (!alarm) return null;
  await cancelNotifications(alarm.notificationIds);
  dbDeleteAlarm(alarm.id);
  await syncGeofencesIfNeeded(alarm);
  return alarm;
}

/**
 * Ångra: återställer en ögonblicksbild och återaktiverar den i OS om den fortfarande
 * är relevant. Ett engångslarm vars tid har passerat återställs som "har ringt".
 */
export async function restoreAlarm(snapshot: LocalAlarm): Promise<void> {
  const base: LocalAlarm = { ...snapshot, notificationIds: [] };

  if (snapshot.status === 'SCHEDULED' && snapshot.triggerType === 'TIME' && snapshot.dateTime) {
    if (!nextOccurrence(snapshot.dateTime, snapshot.repeat)) {
      saveAlarm({ ...base, status: 'FIRED_LOCALLY' });
      return;
    }
    const ids = await scheduleTimeAlarm(snapshot);
    saveAlarm({ ...base, notificationIds: ids });
    return;
  }

  saveAlarm(base);
  if (snapshot.status === 'ACTIVE_GEOFENCE') {
    try {
      await syncGeofencesWithOs();
    } catch (err) {
      updateAlarmStatus(snapshot.id, 'CANCELLED');
      throw err;
    }
  }
}

/**
 * "Klar" från notisen. Ett upprepat larm kvitteras bara för idag – serien fortsätter.
 * Ett engångslarm markeras som klart.
 */
export async function acknowledgeAlarm(alarmId: string): Promise<void> {
  const alarm = getAlarm(alarmId);
  if (!alarm) return;
  if ((alarm.repeat ?? 'NONE') !== 'NONE' && alarm.status === 'SCHEDULED') return;
  await completeAlarm(alarmId);
}

export async function snoozeAlarm(alarmId: string): Promise<void> {
  const alarm = getAlarm(alarmId);
  if (!alarm) return;
  const id = await scheduleSnooze(alarm);
  setNotificationIds(alarm.id, [...(alarm.notificationIds ?? []), id]);
  if (alarm.status === 'FIRED_LOCALLY' || alarm.status === 'MISSED') {
    updateAlarmStatus(alarm.id, 'SCHEDULED');
  }
}

/** Anropas när en larmnotis visas medan appen körs. */
export function markFired(alarmId: string): void {
  const alarm = getAlarm(alarmId);
  if (alarm?.status === 'SCHEDULED' && (alarm.repeat ?? 'NONE') === 'NONE') {
    updateAlarmStatus(alarm.id, 'FIRED_LOCALLY');
  }
}

/**
 * Stämmer av databasen mot OS vid appstart:
 * - framtida/upprepade larm som saknas i OS schemaläggs om (t.ex. efter återställd backup)
 * - engångslarm vars tid passerat markeras "har ringt" om de var schemalagda,
 *   annars "missat" (de kom aldrig in i OS och kan inte ha ringt)
 */
export async function reconcileScheduledAlarms(now: Date = new Date()): Promise<{
  rescheduled: number;
  fired: number;
  missed: number;
}> {
  const result = { rescheduled: 0, fired: 0, missed: 0 };
  const scheduled = getAlarmsByStatus(['SCHEDULED']).filter(
    (a) => a.triggerType === 'TIME' && a.dateTime
  );
  const inOs = await getScheduledByAlarm(scheduled);

  for (const alarm of scheduled) {
    const osIds = inOs.get(alarm.id) ?? [];
    const next = nextOccurrence(alarm.dateTime!, alarm.repeat, now);

    if (!next) {
      if (osIds.length > 0) continue; // t.ex. en snooze som ännu inte ringt
      const wasScheduled = (alarm.notificationIds?.length ?? 0) > 0;
      updateAlarmStatus(alarm.id, wasScheduled ? 'FIRED_LOCALLY' : 'MISSED');
      if (wasScheduled) {
        result.fired++;
      } else {
        result.missed++;
        await logEvent('ALARM_MISSED', alarm.id, { scheduledTime: alarm.dateTime });
      }
      continue;
    }

    if (osIds.length === 0) {
      try {
        // Upprepade larm använder bara klockslaget, engångslarm har här en framtida tid
        const ids = await scheduleTimeAlarm(alarm, now);
        setNotificationIds(alarm.id, ids);
        result.rescheduled++;
      } catch (err) {
        console.warn(`[Alarms] Kunde inte schemalägga om ${alarm.id}:`, err);
      }
    } else if (osIds.join() !== (alarm.notificationIds ?? []).join()) {
      setNotificationIds(alarm.id, osIds);
    }
  }

  await logEvent(
    'BOOT_RESTORE_TRIGGERED',
    'SYSTEM',
    {
      note: `Omschemalagda: ${result.rescheduled}, har ringt: ${result.fired}, missade: ${result.missed}`,
    },
    'TERMINATED_WAKEUP'
  );
  return result;
}
