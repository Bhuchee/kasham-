const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the entire workspace so Metro can hash all files
config.watchFolders = [workspaceRoot];

// App-specific node_modules first — standard monorepo setup.
// React singletons are hard-pinned via resolveRequest below.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Hard-pin react and react-native to apps/mobile/node_modules (react@19.1.0).
//
// Why: the root node_modules has react@19.2.8 (pulled in by apps/api deps).
// If any package (e.g. NativeWind's react-native-css-interop) resolves to 19.2.8
// while app components use 19.1.0, you get either:
//   - "TypeError: Cannot read property 'useContext' of null" (two dispatchers)
//   - "Incompatible React versions: react 19.2.8 / react-native-renderer 19.1.0"
//
// By forcing ALL exact 'react'/'react-native' imports to 19.1.0, every importer
// in the bundle shares one dispatcher and matches react-native-renderer@19.1.0.
//
// NOTE: Only exact names are intercepted — subpaths like 'react/jsx-runtime'
// fall through to normal nodeModulesPaths resolution to avoid SHA-1 hash errors
// (Metro needs an actual file path with extension for those).
const appNodeModules = path.resolve(projectRoot, "node_modules");
const SINGLETON_FILES = {
  react: path.join(appNodeModules, "react", "index.js"),
  "react-native": path.join(appNodeModules, "react-native", "index.js"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = SINGLETON_FILES[moduleName];
  if (pinned && fs.existsSync(pinned)) {
    return { filePath: pinned, type: "sourceFile" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });


