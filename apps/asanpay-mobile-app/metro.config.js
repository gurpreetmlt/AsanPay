const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("@react-native/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileModules = path.resolve(projectRoot, "node_modules");
const rootModules = path.resolve(workspaceRoot, "node_modules");

/**
 * Monorepo hoisting loads duplicate RN libs from the repo root (e.g. safe-area-context 5.x
 * while this app uses 4.14.1). Two copies register the same native view → crash after login.
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

function mobilePackagePath(moduleName) {
  if (moduleName.startsWith("react/") || moduleName.startsWith("react-native/")) {
    return path.join(mobileModules, moduleName);
  }
  if (moduleName.startsWith("@react-navigation/")) {
    const local = path.join(mobileModules, moduleName);
    if (fs.existsSync(local)) return local;
    return null;
  }
  if (PINNED_PACKAGES.includes(moduleName)) {
    const local = path.join(mobileModules, moduleName);
    if (fs.existsSync(local)) return local;
  }
  return null;
}

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [mobileModules, rootModules];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.join(mobileModules, "react"),
  "react-native": path.join(mobileModules, "react-native"),
  "react/jsx-runtime": path.join(mobileModules, "react/jsx-runtime"),
  "react/jsx-dev-runtime": path.join(mobileModules, "react/jsx-dev-runtime"),
  "react-native-safe-area-context": path.join(mobileModules, "react-native-safe-area-context"),
  "react-native-screens": path.join(mobileModules, "react-native-screens"),
  "react-native-linear-gradient": path.join(mobileModules, "react-native-linear-gradient"),
  "react-native-svg": path.join(mobileModules, "react-native-svg"),
  "lucide-react-native": path.join(mobileModules, "lucide-react-native"),
  "@react-native-async-storage/async-storage": path.join(
    mobileModules,
    "@react-native-async-storage/async-storage",
  ),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = mobilePackagePath(moduleName);
  if (pinned) {
    return context.resolveRequest(context, pinned, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
