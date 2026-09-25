package expo.modules.nativealarm

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NativeAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NativeAlarm")

    Function("isAvailable") {
      true
    }

    AsyncFunction("getAuthorizationStatus") {
      if (AlarmScheduler.canScheduleExact(context)) "authorized" else "denied"
    }

    // Behörighet för notiser begärs via expo-notifications; exakta larm ges av USE_EXACT_ALARM
    AsyncFunction("requestAuthorization") {
      if (AlarmScheduler.canScheduleExact(context)) "authorized" else "denied"
    }

    AsyncFunction("schedule") { id: String, title: String, timestampMs: Double, hour: Int, minute: Int, weekdays: List<Int> ->
      try {
        AlarmScheduler.schedule(
          context,
          StoredAlarm(id, title, timestampMs.toLong(), hour, minute, weekdays.toSet()),
        )
      } catch (e: Exception) {
        throw CodedException("ERR_NATIVE_ALARM_SCHEDULE", e.message ?: "Kunde inte schemalägga larmet", e)
      }
    }

    AsyncFunction("cancel") { id: String ->
      AlarmScheduler.cancel(context, id)
    }

    AsyncFunction("getScheduledIds") {
      AlarmScheduler.scheduledIds(context)
    }

    Function("canUseFullScreenIntent") {
      AlarmNotifications.canUseFullScreenIntent(context)
    }

    Function("openFullScreenIntentSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 34) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName))
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
