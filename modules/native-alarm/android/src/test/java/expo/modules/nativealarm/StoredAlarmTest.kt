package expo.modules.nativealarm

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar

/**
 * Schemaläggningslogiken i [StoredAlarm] (ren JVM, ingen enhet behövs).
 * Kör: `./gradlew :native-alarm:testDebugUnitTest` i det genererade android-projektet.
 */
class StoredAlarmTest {
  private fun at(y: Int, m: Int, d: Int, h: Int, min: Int): Long =
    Calendar.getInstance().apply { clear(); set(y, m, d, h, min, 0) }.timeInMillis

  private fun cal(ms: Long): Calendar = Calendar.getInstance().apply { timeInMillis = ms }

  // Fredag 25 september 2026 kl 20:00
  private val friEvening = at(2026, Calendar.SEPTEMBER, 25, 20, 0)
  private val workdays = StoredAlarm("a", "t", 0, 7, 30, setOf(2, 3, 4, 5, 6))

  @Test
  fun vardagarHopparOverHelgen() {
    val next = cal(workdays.nextTrigger(friEvening)!!)
    assertEquals(Calendar.MONDAY, next.get(Calendar.DAY_OF_WEEK))
    assertEquals(28, next.get(Calendar.DAY_OF_MONTH))
    assertEquals(7, next.get(Calendar.HOUR_OF_DAY))
  }

  @Test
  fun dagligtLarmRingerSammaKvall() {
    val daily = StoredAlarm("b", "t", 0, 21, 0, (1..7).toSet())
    val next = cal(daily.nextTrigger(friEvening)!!)
    assertEquals(25, next.get(Calendar.DAY_OF_MONTH))
    assertEquals(21, next.get(Calendar.HOUR_OF_DAY))
  }

  @Test
  fun engangslarm() {
    assertNull(StoredAlarm("c", "t", friEvening - 1000, 0, 0, emptySet()).nextTrigger(friEvening))
    assertEquals(friEvening + 60_000, StoredAlarm("c", "t", friEvening + 60_000, 0, 0, emptySet()).nextTrigger(friEvening))
  }

  @Test
  fun nastaTillfalleEfterEttSomRingtArNastaDag() {
    val daily = StoredAlarm("d", "t", 0, 6, 10, (1..7).toSet())
    val first = daily.nextTrigger(at(2026, Calendar.SEPTEMBER, 26, 6, 5))!!
    val skipped = cal(daily.nextTrigger(first)!!)
    assertEquals(27, skipped.get(Calendar.DAY_OF_MONTH))
    assertEquals(10, skipped.get(Calendar.MINUTE))
  }

  @Test
  fun serieStartarVidStartdatumOchFortsatterObegransat() {
    // Vardagspåminnelse som börjar gälla måndag 28/9 07:31
    val startAfter = StoredAlarm("e", "t", at(2026, Calendar.SEPTEMBER, 28, 7, 31), 7, 30, setOf(2, 3, 4, 5, 6))
    val first = cal(startAfter.nextTrigger(friEvening)!!)
    assertEquals(29, first.get(Calendar.DAY_OF_MONTH))
    assertEquals(7, first.get(Calendar.HOUR_OF_DAY))

    val december = cal(startAfter.nextTrigger(at(2026, Calendar.NOVEMBER, 30, 8, 0))!!)
    assertEquals(Calendar.DECEMBER, december.get(Calendar.MONTH))
    assertEquals(1, december.get(Calendar.DAY_OF_MONTH))
  }

  @Test
  fun startTidLikaMedDagensKlockslagRingerIdag() {
    val today = StoredAlarm("f", "t", at(2026, Calendar.SEPTEMBER, 25, 21, 0), 21, 0, (1..7).toSet())
    val next = cal(today.nextTrigger(friEvening)!!)
    assertEquals(25, next.get(Calendar.DAY_OF_MONTH))
    assertEquals(21, next.get(Calendar.HOUR_OF_DAY))
  }

  @Test
  fun jsonRundresa() {
    assertEquals(workdays, StoredAlarm.fromJson(JSONObject(workdays.toJson().toString())))
  }

  @Test
  fun aldreJsonMedVackningsgruppLasesFortfarande() {
    // Larm sparade av den borttagna väckarklockan har ett extra fält "groupId"
    val legacy = JSONObject("""{"id":"x","title":"t","triggerAtMillis":5,"hour":1,"minute":2,"weekdays":[2],"groupId":"s1"}""")
    assertEquals(StoredAlarm("x", "t", 5, 1, 2, setOf(2)), StoredAlarm.fromJson(legacy))
  }
}
