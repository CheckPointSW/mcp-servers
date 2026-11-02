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

import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, readdirSync, statSync, mkdtempSync, renameSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(process.cwd(), 'package.json');
const backupPath = `${pkgPath}.bak`;
const [,, command] = process.argv;

if (command === 'restore') {
  if (existsSync(backupPath)) {
    replacePackageJson(readFileSync(backupPath, 'utf8'));
    unlinkSync(backupPath);
  }
} else {
  const workspacePackageNames = getWorkspacePackageNames();

  const content = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(content);
  copyFileSync(pkgPath, backupPath);
  if (pkg.dependencies) {
    pkg.dependencies = Object.fromEntries(
      Object.entries(pkg.dependencies).filter(([name]) => !workspacePackageNames.has(name))
    );
    if (Object.keys(pkg.dependencies).length === 0) {
      delete pkg.dependencies;
    }
  }

  replacePackageJson(JSON.stringify(pkg, null, 2) + '\n');
}

// Other packages' prepack hooks scan this manifest while publishing in parallel.
// Stage both stripping and restoration on the same filesystem, then rename so
// readers always see a complete manifest. Copy first to preserve file permissions.
function replacePackageJson(content) {
  const tempDir = mkdtempSync(resolve(dirname(pkgPath), '.package-json-'));
  const tempPath = resolve(tempDir, 'package.json');
  try {
    copyFileSync(pkgPath, tempPath);
    writeFileSync(tempPath, content);
    renameSync(tempPath, pkgPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
