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

  # PINNED EXACTLY, AND DELIBERATELY TO A VERSION TRUNK DOES NOT SERVE YET.
  #
  # This bridge calls FlagContext, variation and allFlags. Trunk serves exactly one
  # version of Intempt — 0.1.0 — and it has none of them, measured against
  # trunk.cocoapods.org rather than inferred.
  #
  # The previous pin here was '~> 0.1', which SELECTS 0.1.0. A consumer therefore got a
  # successful dependency resolution followed by "cannot find 'FlagContext' in scope" at
  # IntemptReactNative.swift — a compile error inside a vendored pod, which reads as a
  # broken SDK rather than as a missing release. The range existed only so CI's branch pod
  # (whose podspec declares 0.1.1) would resolve; it bought that at the cost of resolving
  # to the wrong release for everyone else.
  #
  # An exact 0.1.1 does both jobs honestly:
  #   - a consumer gets "none of your spec sources contain a spec satisfying the dependency
  #     Intempt (= 0.1.1)", which NAMES the missing release instead of hiding it;
  #   - CI's :git/:branch pod still resolves, because that branch declares 0.1.1.
  #
  # `npm run check:native-pins` measures this against trunk on every CI run and is red until
  # intempt-swift publishes. Do not tag a release while it is red.
  s.dependency 'Intempt', '0.1.1'

  # install_modules_dependencies wires React-Core, and on the new architecture
  # also ReactCommon, RCT-Folly, glog and the generated spec. Available in
  # react-native 0.71+.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end
end
