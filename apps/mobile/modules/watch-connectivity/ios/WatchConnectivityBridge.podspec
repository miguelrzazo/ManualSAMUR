Pod::Spec.new do |s|
  s.name           = 'WatchConnectivityBridge'
  s.version        = '1.0.0'
  s.summary        = 'Pushes the public Manual SAMUR snapshot to the Apple Watch app.'
  s.description    = 'Minimal WatchConnectivity sender used as the offline fallback for the Watch companion.'
  s.author         = 'Manual SAMUR'
  s.homepage       = 'https://github.com/miguelrzazo/ManualSAMUR'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
