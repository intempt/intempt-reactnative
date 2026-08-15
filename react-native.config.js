'use strict';

// Autolinking. The Android sourceDir points at the module directory rather than
// the package root so Gradle does not try to configure the package's own
// tooling as a project.
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.intempt.reactnative.IntemptReactNativePackage;',
        packageInstance: 'new IntemptReactNativePackage()',
      },
      ios: {
        podspecPath: './IntemptReactNative.podspec',
      },
    },
  },
};
