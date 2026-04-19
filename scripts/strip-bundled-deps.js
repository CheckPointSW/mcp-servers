#!/usr/bin/env node
// Strips workspace dependencies from package.json before npm pack,
// and restores the original afterward. This prevents npm from trying to fetch
// bundled internal packages from the registry during installation verification.
//
// The filter is based on actual workspace package names (read from the monorepo
// root), not the version string — so external deps with unconventional version
// strings are never accidentally stripped.
//
// Usage:
//   prepack:  node ../../scripts/strip-bundled-deps.js
//   postpack: node ../../scripts/strip-bundled-deps.js restore

import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(process.cwd(), 'package.json');
const backupPath = `${pkgPath}.bak`;
const [,, command] = process.argv;

if (command === 'restore') {
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, pkgPath);
    unlinkSync(backupPath);
  }
} else {
  const workspacePackageNames = getWorkspacePackageNames();

  const content = readFileSync(pkgPath, 'utf8');
  copyFileSync(pkgPath, backupPath);

  const pkg = JSON.parse(content);
  if (pkg.dependencies) {
    pkg.dependencies = Object.fromEntries(
      Object.entries(pkg.dependencies).filter(([name]) => !workspacePackageNames.has(name))
    );
    if (Object.keys(pkg.dependencies).length === 0) {
      delete pkg.dependencies;
    }
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function getWorkspacePackageNames() {
  const names = new Set();
  const packagesDir = resolve(rootDir, 'packages');
  for (const dir of readdirSync(packagesDir)) {
    const pkgJsonPath = resolve(packagesDir, dir, 'package.json');
    if (existsSync(pkgJsonPath) && statSync(resolve(packagesDir, dir)).isDirectory()) {
      const { name } = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      if (name) names.add(name);
    }
  }
  return names;
}
