/**
 * Metro config for an example app that consumes the package it lives inside.
 *
 * The dependency is `file:..`, which npm installs as a symlink to the
 * repository root. Metro does not follow that symlink on its own: the package
 * resolves (or fails) against the example's node_modules, and the SDK's
 * source sits outside the project root, so a bare Expo config red-screens
 * with "Unable to resolve module intempt-react-native" (the flow the README
 * documents, broken as committed).
 *
 * Three things make the link work:
 *  - watchFolders: the repo root is outside the project root, so Metro must
 *    be told to watch and serve it.
 *  - extraNodeModules: resolve `intempt-react-native` to the repo root
 *    explicitly rather than through the symlink.
 *  - blockList: the repo root's own node_modules carries react/react-native
 *    as devDependencies for the SDK's tests. If Metro can reach those, the
 *    bundle gets two copies of React and the app dies at runtime; block them
 *    so every peer resolves to the example's single copy.
 */
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.extraNodeModules = {
  'intempt-react-native': workspaceRoot,
};

// SDK source lives under the workspace root, so Metro's node_modules walk from
// there never reaches the example's copies of react/react-native. Add them as
// an explicit search path; with the blockList below, it is also the ONLY place
// those peers can come from.
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];

const escapeForRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  new RegExp(`${escapeForRegExp(path.join(workspaceRoot, 'node_modules', 'react'))}\\/.*`),
  new RegExp(`${escapeForRegExp(path.join(workspaceRoot, 'node_modules', 'react-native'))}\\/.*`),
  new RegExp(`${escapeForRegExp(path.join(workspaceRoot, 'example', 'node_modules', 'intempt-react-native', 'node_modules'))}\\/.*`),
];

module.exports = config;
