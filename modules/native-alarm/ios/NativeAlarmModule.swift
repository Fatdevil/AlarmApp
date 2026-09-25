import ExpoModulesCore
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

/**
 Riktiga systemlarm via AlarmKit (iOS 26+): bryter igenom tyst läge och Fokus och visas
 på låsskärmen och i Dynamic Island. På äldre iOS är modulen "otillgänglig" och JS faller
 tillbaka till vanliga notiser.
 */
public class NativeAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeAlarm")

    Function("isAvailable") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return true
      }
      #endif
      return false
    }

    AsyncFunction("getAuthorizationStatus") { () -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return AlarmKitBridge.describe(AlarmManager.shared.authorizationState)
      }
      #endif
      return "unavailable"
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let state = try await AlarmManager.shared.requestAuthorization()
        return AlarmKitBridge.describe(state)
      }
      #endif
      return "unavailable"
    }

    AsyncFunction("schedule") { (id: String, title: String, timestampMs: Double, hour: Int, minute: Int, weekdays: [Int]) async throws in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: id) else {
          throw InvalidAlarmIdException(id)
        }
        try await AlarmKitBridge.schedule(
          id: uuid,
          title: title,
          date: Date(timeIntervalSince1970: timestampMs / 1000),
          hour: hour,
          minute: minute,
          weekdays: weekdays
        )
        return
      }
      #endif
      throw AlarmKitUnavailableException()
    }

    AsyncFunction("cancel") { (id: String) in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: id) else {
          return
        }
        // Kastar om larmet redan är borta – det är inget fel för oss
        try? AlarmManager.shared.cancel(id: uuid)
      }
      #endif
    }

    AsyncFunction("getScheduledIds") { () -> [String] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let alarms = (try? AlarmManager.shared.alarms) ?? []
        return alarms.map { $0.id.uuidString.lowercased() }
      }
      #endif
      return []
    }

    // Helskärmsbehörighet finns bara på Android
    Function("canUseFullScreenIntent") { () -> Bool in
      return true
    }

    Function("openFullScreenIntentSettings") {}
  }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct AlarmAppMetadata: AlarmMetadata {}

@available(iOS 26.0, *)
enum AlarmKitBridge {
  static func describe(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "denied"
    }
  }

  /// expo-notifications-numrering: 1 = söndag … 7 = lördag.
  static func weekday(_ n: Int) -> Locale.Weekday? {
    switch n {
    case 1: return .sunday
    case 2: return .monday
    case 3: return .tuesday
    case 4: return .wednesday
    case 5: return .thursday
    case 6: return .friday
    case 7: return .saturday
    default: return nil
    }
  }

  static func schedule(id: UUID, title: String, date: Date, hour: Int, minute: Int, weekdays: [Int]) async throws {
    let schedule: Alarm.Schedule
    if weekdays.isEmpty {
      schedule = .fixed(date)
    } else {
      schedule = .relative(
        Alarm.Schedule.Relative(
          time: Alarm.Schedule.Relative.Time(hour: hour, minute: minute),
          repeats: .weekly(weekdays.compactMap(weekday))
        )
      )
    }

    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(String.LocalizationValue(title)),
      stopButton: AlarmButton(text: "Stäng av", textColor: .white, systemImageName: "stop.circle")
    )
    let attributes = AlarmAttributes<AlarmAppMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: AlarmAppMetadata(),
      tintColor: Color(red: 0.145, green: 0.388, blue: 0.922)
    )
    let configuration = AlarmManager.AlarmConfiguration<AlarmAppMetadata>(
      countdownDuration: nil,
      schedule: schedule,
      attributes: attributes,
      stopIntent: nil,
      secondaryIntent: nil,
      sound: .default
    )
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
  }
}
#endif

final class AlarmKitUnavailableException: Exception, @unchecked Sendable {
  override var reason: String {
    "AlarmKit kräver iOS 26 eller senare"
  }
}

final class InvalidAlarmIdException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Ogiltigt larm-ID (måste vara UUID): \(param)"
  }
}
