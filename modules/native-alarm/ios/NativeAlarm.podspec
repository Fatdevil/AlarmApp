Pod::Spec.new do |s|
  s.name           = 'NativeAlarm'
  s.version        = '0.1.0'
  s.summary        = 'System alarms via AlarmKit (iOS 26+)'
  s.description    = 'Schedules real system alarms with AlarmKit that break through silent mode and Focus.'
  s.author         = ''
  s.homepage       = 'https://github.com/Fatdevil/AlarmApp'
  s.license        = 'MIT'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # AlarmKit finns bara på iOS 26+. Svag länkning gör att appen startar på äldre iOS.
  s.weak_frameworks = 'AlarmKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
