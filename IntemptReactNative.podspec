require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'IntemptReactNative'
  s.version      = package['version']
  s.summary      = package['description']
  s.description  = package['description']
  s.license      = package['license']
  s.author       = { 'Intempt Technologies, Inc.' => 'support@intempt.com' }
  s.homepage     = package['homepage']
  s.source       = { :git => 'https://github.com/intempt/intempt-reactnative.git', :tag => s.version }

  # Matches intempt-swift's Package.swift floor. React Native 0.81 itself
  # requires iOS 15.1, so this is not the binding constraint.
  s.platforms    = { :ios => '15.1' }
  s.swift_version = '5.9'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.requires_arc = true
  s.preserve_paths = 'LICENSE', 'NOTICE', 'README.md', 'package.json'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }

  # Pinned exactly, not optimistically. 0.1.0 is intempt-swift's first release:
  # 311 tests pass and the live contract tests run against production, but it
  # has no mileage in a shipped customer app. A '~> 0.1' would silently pick up
  # 0.1.1 the day it exists.
  #
  # Not yet on CocoaPods trunk — `pod trunk push` needs a registered trunk
  # session, which is an email round-trip against a real account. Until that
  # happens, a consumer resolves it from git instead:
  #
  #   pod 'Intempt', :git => 'https://github.com/intempt/intempt-swift.git',
  #                  :tag => 'v0.1.0'
  #
  # intempt-swift is public as of 2026-08-15, so that resolves anonymously.
  s.dependency 'Intempt', '0.1.0'

  # install_modules_dependencies wires React-Core, and on the new architecture
  # also ReactCommon, RCT-Folly, glog and the generated spec. Available in
  # react-native 0.71+.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end
end
