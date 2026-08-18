import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'lib/**',
      'example/**',
      'node_modules/**',
      '.stryker-tmp/**',
      'reports/**',
      'coverage/**',
      'e2e/**',
      'scripts/**',
      '*.config.mjs',
      '*.config.js',
      'babel.config.js',
      'react-native.config.js',
      'jest.setup.js',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Codegen mandates the literal `Object` type for structured maps crossing
    // the bridge — see the file header in NativeIntempt.ts.
    files: ['src/NativeIntempt.ts'],
    rules: {
      '@typescript-eslint/no-wrapper-object-types': 'off',
    },
  },
);
