package expo.modules.nativealarm

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.DateFormat
import java.util.Date

/**
 * Helskärmsvy som visas över låsskärmen när larmet ringer. Ljudet kommer från
 * notisen (FLAG_INSISTENT) och tystnar när notisen tas bort.
 */
class AlarmActivity : Activity() {
  companion object {
    const val EXTRA_TITLE = "title"
    const val ACTION_FINISH = "expo.modules.nativealarm.FINISH_ACTIVITY"
  }

  private val finishReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()

    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: run {
      finish()
      return
    }
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Larm"

    setContentView(buildLayout(id, title))

    val filter = IntentFilter(ACTION_FINISH)
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(finishReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(finishReceiver, filter)
    }
  }

  override fun onDestroy() {
    try {
      unregisterReceiver(finishReceiver)
    } catch (e: IllegalArgumentException) {
      // Inte registrerad (onCreate avbröts tidigt)
    }
    super.onDestroy()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  private fun buildLayout(id: String, title: String): LinearLayout {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#090D16"))
      setPadding(dp(32), dp(48), dp(32), dp(48))
    }

    root.addView(TextView(this).apply {
      text = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date())
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 72f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    })

    root.addView(TextView(this).apply {
      text = title
      setTextColor(Color.parseColor("#B4C0D3"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      gravity = Gravity.CENTER
      setPadding(0, dp(16), 0, dp(48))
    })

    fun button(label: String, background: String, onClick: () -> Unit) = Button(this).apply {
      text = label
      isAllCaps = false
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      setBackgroundColor(Color.parseColor(background))
      minHeight = dp(64)
      setOnClickListener { onClick() }
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { topMargin = dp(16) }
    }

    root.addView(button("Stäng av", "#2563EB") {
      AlarmNotifications.dismiss(this, id)
      finish()
    })
    root.addView(button("Snooza ${AlarmScheduler.SNOOZE_MINUTES} min", "#263450") {
      try {
        AlarmScheduler.snooze(this, id)
      } catch (e: Exception) {
        AlarmNotifications.dismiss(this, id)
      }
      finish()
    })

    return root
  }
}
