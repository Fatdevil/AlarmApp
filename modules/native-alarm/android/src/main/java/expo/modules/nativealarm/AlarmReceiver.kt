package expo.modules.nativealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    try {
      when (intent.action) {
        AlarmScheduler.ACTION_FIRE -> {
          val alarm = AlarmStore(context).get(id) ?: return
          AlarmNotifications.show(context, alarm)
          AlarmScheduler.onFired(context, alarm)
        }
        AlarmScheduler.ACTION_STOP -> {
          AlarmNotifications.dismiss(context, id)
          context.sendBroadcast(Intent(AlarmActivity.ACTION_FINISH).setPackage(context.packageName))
        }
        AlarmScheduler.ACTION_SNOOZE -> {
          AlarmScheduler.snooze(context, id)
          context.sendBroadcast(Intent(AlarmActivity.ACTION_FINISH).setPackage(context.packageName))
        }
      }
    } catch (e: Exception) {
      Log.e("NativeAlarm", "Fel vid hantering av ${intent.action}", e)
    }
  }
}

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      AlarmScheduler.rescheduleAll(context)
    } catch (e: Exception) {
      Log.e("NativeAlarm", "Kunde inte återställa larm efter ${intent.action}", e)
    }
  }
}
