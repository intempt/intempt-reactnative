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

  # PINNED EXACTLY, to the published release that carries the flag surface this PR bridges.
  #
  # This bridge calls FlagContext, variation, allFlags AND (as of this PR)
  # IntemptInstance.initialize's useIPAddressForGeolocation parameter. Trunk serves 0.1.0,
  # 0.2.0 and 0.3.0; the flag/variation surface arrived in 0.2.0 but
  # useIPAddressForGeolocation only exists from 0.3.0 (intempt-swift#11/#13) — measured
  # against trunk.cocoapods.org and the sources of tag v0.3.0, not inferred.
  #
  # Earlier pins are recorded because each was wrong in an instructive way. '~> 0.1'
  # SELECTS 0.1.0, so a consumer got a successful dependency resolution followed by "cannot
  # find 'FlagContext' in scope" at IntemptReactNative.swift — a compile error inside a
  # vendored pod, which reads as a broken SDK rather than as a missing release. An exact
  # '0.1.1' replaced it so resolution would fail by NAME instead; trunk never served 0.1.1,
  # because intempt-swift shipped the flag surface as 0.2.0. '0.2.0' itself went stale the
  # same way once this PR added a call to useIPAddressForGeolocation, which 0.2.0 lacks.
  #
  # Exact rather than '~> 0.3': this bridge compiles against symbols it does not own, so a
  # new SDK minor should not reach a customer's build before this repo's CI has seen it.
  #
  # `npm run check:native-pins` resolves this against trunk on every CI run and downloads
  # what it selects to confirm the symbol is really in there. Do not tag while it is red.
  s.dependency 'Intempt', '0.3.0'

  # install_modules_dependencies wires React-Core, and on the new architecture
  # also ReactCommon, RCT-Folly, glog and the generated spec. Available in
  # react-native 0.71+.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end
end
