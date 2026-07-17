const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo so Metro sees shared packages (e.g. @udt/shared)
config.watchFolders = [workspaceRoot];

// 2. Tell Metro exactly where to look for modules.
//    List the app-level node_modules first so it always wins over the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Disable hierarchical lookup so Metro does NOT walk up past projectRoot
//    and stumble into the pnpm virtual store (.pnpm) where older package versions live.
config.resolver.disableHierarchicalLookup = true;

// 4. Follow pnpm symlinks (each package in node_modules/ is a symlink into .pnpm/)
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
