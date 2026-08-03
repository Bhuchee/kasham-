const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the entire workspace
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Canonical paths for singletons — every require('react') in the entire
// bundle (including NativeWind internals) must resolve to the same file.
const SINGLETON_MODULES = {
  react: path.resolve(workspaceRoot, "node_modules/react/index.js"),
  "react-native": path.resolve(
    workspaceRoot,
    "node_modules/react-native/index.js"
  ),
  "react-dom": path.resolve(workspaceRoot, "node_modules/react-dom/index.js"),
};

// extraNodeModules handles the simple name→directory redirect
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, "node_modules/react"),
  "react-native": path.resolve(workspaceRoot, "node_modules/react-native"),
  "react-dom": path.resolve(workspaceRoot, "node_modules/react-dom"),
};

// resolveRequest intercepts ALL resolution calls regardless of requester path,
// ensuring no local node_modules copy of react/react-native ever wins.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Exact match: require('react'), require('react-native'), require('react-dom')
  if (SINGLETON_MODULES[moduleName]) {
    return { filePath: SINGLETON_MODULES[moduleName], type: "sourceFile" };
  }
  // Subpath match: require('react/jsx-runtime'), require('react-native/Libraries/...')
  for (const [mod, filePath] of Object.entries(SINGLETON_MODULES)) {
    if (moduleName.startsWith(mod + "/")) {
      const subpath = moduleName.slice(mod.length + 1);
      const resolved = path.resolve(
        workspaceRoot,
        "node_modules",
        mod,
        subpath
      );
      return { filePath: resolved, type: "sourceFile" };
    }
  }
  // Fall back to default Metro resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
