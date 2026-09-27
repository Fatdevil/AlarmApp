package expo.modules.nativealarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.nativealarm.FIRE"
  const val ACTION_STOP = "expo.modules.nativealarm.STOP"
  const val ACTION_SNOOZE = "expo.modules.nativealarm.SNOOZE"
  const val EXTRA_ID = "alarmId"
  const val EXTRA_GROUP = "groupId"
  const val EXTRA_TITLE = "title"

  const val SNOOZE_MINUTES = 10
  private const val SNOOZE_SUFFIX = ":snooze"
  private const val LATE_FIRE_GRACE_MS = 15 * 60 * 1000L
  private const val GROUP_WINDOW_MS = 3 * 60 * 60 * 1000L

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return alarmManager(context).canScheduleExactAlarms()
  }

  /** Schemalägger (eller ersätter) ett larm med setAlarmClock – undantaget från Doze. */
  fun schedule(context: Context, alarm: StoredAlarm, after: Long = System.currentTimeMillis()) {
    if (!canScheduleExact(context)) {
      throw IllegalStateException("Exakta larm är inte tillåtna för appen")
    }
    val trigger = alarm.nextTrigger(after) ?: throw IllegalArgumentException("Tiden har redan passerat")
    val info = AlarmManager.AlarmClockInfo(trigger, openAppIntent(context, alarm.id))
    alarmManager(context).setAlarmClock(info, fireIntent(context, alarm.id))
    AlarmStore(context).put(alarm)
  }

  fun cancel(context: Context, id: String) {
    for (key in listOf(id, id + SNOOZE_SUFFIX)) {
      alarmManager(context).cancel(fireIntent(context, key))
      AlarmStore(context).remove(key)
      AlarmNotifications.dismiss(context, key)
    }
  }

  /**
   * Snooza ett larm som ringer. Ett engångslarm är redan borttaget ur lagringen när
   * det ringer (se onFired), så titel och grupp skickas med i intentet som reserv.
   */
  fun snooze(context: Context, id: String, title: String? = null, groupId: String? = null) {
    AlarmNotifications.dismiss(context, id)
    val store = AlarmStore(context)
    val baseId = id.removeSuffix(SNOOZE_SUFFIX)
    val source = store.get(id) ?: store.get(baseId)
    val snoozeTitle = source?.title ?: title ?: "Larm"
    val snoozeGroup = source?.groupId ?: groupId ?: ""
    val at = System.currentTimeMillis() + SNOOZE_MINUTES * 60_000L
    schedule(context, StoredAlarm(baseId + SNOOZE_SUFFIX, snoozeTitle, at, 0, 0, emptySet(), snoozeGroup))
  }

  /** Avbryter alla larm (används när användaren raderar all data). */
  fun cancelAll(context: Context) {
    for (alarm in AlarmStore(context).all()) {
      cancel(context, alarm.id)
    }
    SkipLog(context).consume()
  }

  /**
   * Väckningsserie: användaren har stängt av ett larm och är vaken. Övriga larm i
   * gruppen som skulle ringa inom tre timmar hoppas över (återkommande larm flyttas
   * till sitt nästa tillfälle, engångslarm tas bort).
   */
  fun skipRestOfGroup(context: Context, stoppedId: String, groupId: String) {
    if (groupId.isEmpty()) return
    val now = System.currentTimeMillis()
    val stoppedBase = stoppedId.removeSuffix(SNOOZE_SUFFIX)
    for (alarm in AlarmStore(context).all()) {
      if (alarm.groupId != groupId || alarm.id.removeSuffix(SNOOZE_SUFFIX) == stoppedBase) continue
      val next = alarm.nextTrigger(now) ?: continue
      if (next - now > GROUP_WINDOW_MS) continue
      if (!alarm.id.endsWith(SNOOZE_SUFFIX)) {
        SkipLog(context).record(alarm.id, next + 60_000L)
      }
      if (alarm.isRepeating && !alarm.id.endsWith(SNOOZE_SUFFIX)) {
        try {
          schedule(context, alarm, after = next)
        } catch (e: Exception) {
          cancel(context, alarm.id)
        }
      } else {
        cancel(context, alarm.id)
      }
    }
  }

  /** Anropas när ett larm har ringt: nästa tillfälle för upprepade, annars bort ur lagringen. */
  fun onFired(context: Context, alarm: StoredAlarm) {
    if (alarm.isRepeating) {
      try {
        schedule(context, alarm)
      } catch (e: Exception) {
        AlarmStore(context).remove(alarm.id)
      }
    } else {
      AlarmStore(context).remove(alarm.id)
    }
  }

  /** Efter omstart, uppdatering eller ändrad tidszon: AlarmManager glömmer allt vid omstart. */
  fun rescheduleAll(context: Context) {
    val now = System.currentTimeMillis()
    for (alarm in AlarmStore(context).all()) {
      if (!alarm.isRepeating && alarm.triggerAtMillis <= now) {
        // Ringde medan telefonen var avstängd: ring nu om det är nyligen, annars släpp det
        if (now - alarm.triggerAtMillis < LATE_FIRE_GRACE_MS) {
          AlarmNotifications.show(context, alarm)
        }
        AlarmStore(context).remove(alarm.id)
        continue
      }
      try {
        schedule(context, alarm)
      } catch (e: Exception) {
        AlarmStore(context).remove(alarm.id)
      }
    }
  }

  fun scheduledIds(context: Context): List<String> = AlarmStore(context).all().map { it.id }

  fun consumeSkips(context: Context): Map<String, Double> =
    SkipLog(context).consume().mapValues { it.value.toDouble() }

  private fun alarmManager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun fireIntent(context: Context, id: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      .setData(Uri.parse("nativealarm://alarm/" + Uri.encode(id)))
      .putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun openAppIntent(context: Context, id: String): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launch.data = Uri.parse("alarmapp://?focus=" + Uri.encode(id.removeSuffix(SNOOZE_SUFFIX)))
    return PendingIntent.getActivity(
      context,
      id.hashCode(),
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun actionIntent(context: Context, action: String, id: String, groupId: String, title: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(action)
      .setData(Uri.parse("nativealarm://" + action.substringAfterLast('.').lowercase() + "/" + Uri.encode(id)))
      .putExtra(EXTRA_ID, id)
      .putExtra(EXTRA_GROUP, groupId)
      .putExtra(EXTRA_TITLE, title)
    return PendingIntent.getBroadcast(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
