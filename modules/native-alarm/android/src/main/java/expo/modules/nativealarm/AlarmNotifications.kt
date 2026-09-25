package expo.modules.nativealarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

object AlarmNotifications {
  private const val CHANNEL_ID = "native_alarm_v1"

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun notificationId(alarmId: String): Int = alarmId.hashCode()

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = manager(context)
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Väckarklocka", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Larm som ringer tills du stänger av dem"
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 800, 400, 800)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    }
    nm.createNotificationChannel(channel)
  }

  /**
   * Visar larmet: helskärm över låsskärmen (om tillåtet), annars en heads-up-notis.
   * FLAG_INSISTENT gör att ljudet upprepas tills användaren stänger av larmet.
   */
  fun show(context: Context, alarm: StoredAlarm) {
    ensureChannel(context)

    val fullScreen = PendingIntent.getActivity(
      context,
      notificationId(alarm.id),
      Intent(context, AlarmActivity::class.java)
        .putExtra(AlarmScheduler.EXTRA_ID, alarm.id)
        .putExtra(AlarmActivity.EXTRA_TITLE, alarm.title)
        .setData(Uri.parse("nativealarm://activity/" + Uri.encode(alarm.id)))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
        .setPriority(Notification.PRIORITY_MAX)
        .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
    }

    val notification = builder
      .setSmallIcon(smallIcon(context))
      .setContentTitle(alarm.title)
      .setContentText("Larm")
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(AlarmScheduler.openAppIntent(context, alarm.id))
      .setFullScreenIntent(fullScreen, true)
      .addAction(
        Notification.Action.Builder(
          null,
          "Stäng av",
          AlarmScheduler.actionIntent(context, AlarmScheduler.ACTION_STOP, alarm.id),
        ).build()
      )
      .addAction(
        Notification.Action.Builder(
          null,
          "Snooza ${AlarmScheduler.SNOOZE_MINUTES} min",
          AlarmScheduler.actionIntent(context, AlarmScheduler.ACTION_SNOOZE, alarm.id),
        ).build()
      )
      .build()

    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    manager(context).notify(notificationId(alarm.id), notification)
  }

  fun dismiss(context: Context, alarmId: String) {
    manager(context).cancel(notificationId(alarmId))
  }

  /** Android 14+: helskärmsnotiser kan vara avstängda av användaren eller Play-policy. */
  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    return manager(context).canUseFullScreenIntent()
  }

  private fun smallIcon(context: Context): Int {
    // expo-notifications-pluginet genererar en monokrom notis-ikon med detta namn
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }
}
