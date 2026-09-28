package expo.modules.nativealarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Ett schemalagt larm. [weekdays] använder Calendar-numrering (1 = söndag … 7 = lördag),
 * samma som expo-notifications. Tom mängd = engångslarm vid [triggerAtMillis].
 */
data class StoredAlarm(
  val id: String,
  val title: String,
  val triggerAtMillis: Long,
  val hour: Int,
  val minute: Int,
  val weekdays: Set<Int>,
  /** Väckningsserie: larm med samma groupId hoppas över när ett av dem stängs av. */
  val groupId: String = "",
) {
  val isRepeating: Boolean get() = weekdays.isNotEmpty()

  /**
   * Nästa tillfälle efter [now], eller null för ett passerat engångslarm. Ett
   * återkommande larm ringer aldrig före [triggerAtMillis] – så kan "Hoppa över
   * nästa" starta hela serien efter det överhoppade tillfället och fortsätta
   * obegränsat, utan att appen behöver öppnas igen.
   */
  fun nextTrigger(now: Long = System.currentTimeMillis()): Long? {
    if (!isRepeating) return if (triggerAtMillis > now) triggerAtMillis else null
    val from = maxOf(now, triggerAtMillis - 1)
    val cal = Calendar.getInstance().apply {
      timeInMillis = from
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    for (i in 0..7) {
      if (cal.timeInMillis > from && cal.get(Calendar.DAY_OF_WEEK) in weekdays) return cal.timeInMillis
      cal.add(Calendar.DAY_OF_YEAR, 1)
    }
    return null
  }

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("triggerAtMillis", triggerAtMillis)
    .put("hour", hour)
    .put("minute", minute)
    .put("weekdays", JSONArray(weekdays.toList()))
    .put("groupId", groupId)

  companion object {
    fun fromJson(o: JSONObject): StoredAlarm {
      val days = o.getJSONArray("weekdays")
      return StoredAlarm(
        id = o.getString("id"),
        title = o.getString("title"),
        triggerAtMillis = o.getLong("triggerAtMillis"),
        hour = o.getInt("hour"),
        minute = o.getInt("minute"),
        weekdays = (0 until days.length()).map { days.getInt(it) }.toSet(),
        groupId = o.optString("groupId", ""),
      )
    }
  }
}

/** Beständig lagring så att larm kan återställas efter omstart utan att JS körs. */
class AlarmStore(context: Context) {
  private val prefs = context.applicationContext
    .getSharedPreferences("expo.modules.nativealarm.alarms", Context.MODE_PRIVATE)

  fun all(): List<StoredAlarm> = prefs.all.values.mapNotNull { value ->
    try {
      StoredAlarm.fromJson(JSONObject(value as String))
    } catch (e: Exception) {
      null
    }
  }

  fun get(id: String): StoredAlarm? = prefs.getString(id, null)?.let {
    try {
      StoredAlarm.fromJson(JSONObject(it))
    } catch (e: Exception) {
      null
    }
  }

  fun put(alarm: StoredAlarm) {
    prefs.edit().putString(alarm.id, alarm.toJson().toString()).apply()
  }

  fun remove(id: String) {
    prefs.edit().remove(id).apply()
  }
}

/**
 * Larm som Android hoppade över på egen hand ("Jag är vaken" i en serie), så att
 * appen kan föra över överhoppningen till sin databas nästa gång den körs.
 * Nyckel = larm-ID, värde = tidpunkten då överhoppningen upphör (ms).
 */
class SkipLog(context: Context) {
  private val prefs = context.applicationContext
    .getSharedPreferences("expo.modules.nativealarm.skips", Context.MODE_PRIVATE)

  fun record(id: String, skippedUntilMillis: Long) {
    prefs.edit().putLong(id, skippedUntilMillis).apply()
  }

  /** Returnerar och rensar loggen. */
  fun consume(): Map<String, Long> {
    val entries = prefs.all.mapNotNull { (k, v) -> (v as? Long)?.let { k to it } }.toMap()
    prefs.edit().clear().apply()
    return entries
  }
}

