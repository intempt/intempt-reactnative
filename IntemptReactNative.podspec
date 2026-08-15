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

  # PREREQUISITE, not yet satisfiable. As of 2026-08-15 intempt-swift has no
  # podspec, no git tags, and trunk.cocoapods.org returns 404 for both
  # 'Intempt' and 'IntemptSDK'. `pod install` cannot resolve this line until
  # the Swift SDK is published to trunk.
  #
  # The constraint below assumes the pod is named 'Intempt' and first ships as
  # 0.1.x. Both are assumptions — the iOS session owns the real name and
  # version, and this line changes to match whatever they publish.
  # See docs/superpowers/specs/2026-08-15-intempt-reactnative-design.md, open
  # question 1.
  s.dependency 'Intempt', '~> 0.1'

  # install_modules_dependencies wires React-Core, and on the new architecture
  # also ReactCommon, RCT-Folly, glog and the generated spec. Available in
  # react-native 0.71+.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end
end
