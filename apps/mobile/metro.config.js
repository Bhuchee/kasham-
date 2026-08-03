const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the entire workspace so Metro can hash files outside projectRoot
config.watchFolders = [workspaceRoot];

// Workspace root FIRST — subpath imports (e.g. react/jsx-runtime) also
// prefer the canonical workspace version over any app-local copy.
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(projectRoot, "node_modules"),
];

// The single canonical index.js for each React singleton.
// Must point to real files with extensions — Metro needs to hash them.
const SINGLETON_MODULES = {
  react: path.resolve(workspaceRoot, "node_modules/react/index.js"),
  "react-native": path.resolve(
    workspaceRoot,
    "node_modules/react-native/index.js"
  ),
  "react-dom": path.resolve(workspaceRoot, "node_modules/react-dom/index.js"),
};

// resolveRequest: intercept ONLY exact package-name imports.
// Subpaths (e.g. react/jsx-runtime) are intentionally NOT intercepted here —
// Metro must resolve them through nodeModulesPaths so it can apply its own
// extension-matching logic and produce a valid hashed file path.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETON_MODULES[moduleName]) {
    return { filePath: SINGLETON_MODULES[moduleName], type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
