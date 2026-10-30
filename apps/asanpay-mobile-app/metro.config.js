const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("@react-native/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileModules = path.resolve(projectRoot, "node_modules");
const rootModules = path.resolve(workspaceRoot, "node_modules");

/**
 * Monorepo hoisting can leave duplicate RN libs at the repo root with a different version than
 * this app's copy. Two copies register the same native view → crash after login.
 */
const PINNED_PACKAGES = [
  "react",
  "react-native",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-linear-gradient",
  "react-native-svg",
  "lucide-react-native",
  "zustand",
  "@react-native-async-storage/async-storage",
];

function isPinned(moduleName) {
  if (moduleName.startsWith("react/") || moduleName.startsWith("react-native/")) return true;
  if (moduleName.startsWith("@react-navigation/") || PINNED_PACKAGES.includes(moduleName)) {
    return fs.existsSync(path.join(mobileModules, moduleName));
  }
  return false;
}

// Resolving by name (not by file path) keeps package.json "exports" subpaths working,
// e.g. react-native/react-private-interface → src/react-private-interface.js.
const mobileOrigin = path.join(projectRoot, "index.js");

// react / react-native hoist to the repo root once every workspace shares one React version.
function moduleDir(name) {
  const local = path.join(mobileModules, name);
  return fs.existsSync(local) ? local : path.join(rootModules, name);
}

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [mobileModules, rootModules];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: moduleDir("react"),
  "react-native": moduleDir("react-native"),
  "react/jsx-runtime": path.join(moduleDir("react"), "jsx-runtime"),
  "react/jsx-dev-runtime": path.join(moduleDir("react"), "jsx-dev-runtime"),
  "react-native-safe-area-context": moduleDir("react-native-safe-area-context"),
  "react-native-screens": moduleDir("react-native-screens"),
  "react-native-linear-gradient": moduleDir("react-native-linear-gradient"),
  "react-native-svg": moduleDir("react-native-svg"),
  "lucide-react-native": moduleDir("lucide-react-native"),
  "@react-native-async-storage/async-storage": moduleDir("@react-native-async-storage/async-storage"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isPinned(moduleName)) {
    return context.resolveRequest({ ...context, originModulePath: mobileOrigin }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
