#!/usr/bin/env node

/**
 * Enhanced MCP Package Bundler with Dependency Propagation
 * 
 * This bundler:
 * 1. Uses ESBuild to bundle TypeScript MCP packages
 * 2. Automatically bundles @chkp packages (mcp-utils, quantum-infra) 
 * 3. Propagates their dependencies to the consuming package
 * 4. Detects and warns about missing dependencies for npm packaging
 * 5. Handles version conflicts between propagated dependencies
 * 
 * Key insight: npm packaging uses root package.json for dependencies,
 * so propagated dependencies must be declared there for runtime resolution.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { builtinModules } from 'module';

// Get the current working directory (where the script is called from)  
const cwd = process.cwd();

// Read package.json
const packageJson = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));

/**
 * Build a mapping of package names to their directory names
 * 
 * This scans the packages/ directory to create a map like:
 * "@chkp/mcp-utils" -> "mcp-utils"
 * "@chkp/quantum-infra" -> "infra"
 * 
 * This is needed because package names don't always match directory names.
 */
function buildPackageMapping() {
  const mapping = new Map();
  const packagesDir = resolve(cwd, '..');
  
  try {
    const entries = readdirSync(packagesDir);
    
    for (const entry of entries) {
      const entryPath = resolve(packagesDir, entry);
      
      // Skip non-directories and hidden files
      if (!statSync(entryPath).isDirectory() || entry.startsWith('.')) {
        continue;
      }
      
      const packageJsonPath = resolve(entryPath, 'package.json');
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.name) {
          mapping.set(packageJson.name, entry);
        }
      } catch (error) {
        // Skip directories without valid package.json
        continue;
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not scan packages directory: ${error.message}`);
  }
  
  return mapping;
}

/**
 * Collect external dependencies from @chkp packages that will be bundled
 * 
 * When we bundle @chkp/mcp-utils and @chkp/quantum-infra, their external 
 * dependencies (like axios, zod, commander) need to be available at runtime.
 * This function finds all such dependencies and handles version conflicts.
 * 
 * Returns a Map of dependency name -> version that need to be declared
 * in the consuming package's package.json for proper npm packaging.
 */
function collectChkpDependencies() {
  const collected = new Map(); // Use Map to store name -> version
  const versionConflicts = new Map(); // Track version conflicts
  const devDependencies = packageJson.devDependencies || {};
  const dependencies = packageJson.dependencies || {}; // Also check dependencies
  const packageMapping = buildPackageMapping();
  
  // Find all @chkp packages in both devDependencies and dependencies
  const allDeps = { ...devDependencies, ...dependencies };
  for (const [depName, depVersion] of Object.entries(allDeps)) {
    if (depName.startsWith('@chkp/') || depName.startsWith('@chkp-internal/')) {
      try {
        // Find the directory for this package using the mapping
        const dirName = packageMapping.get(depName);
        if (!dirName) {
          console.warn(`⚠️  Could not find directory for package ${depName}`);
          continue;
        }
        
        const chkpPackageJsonPath = resolve(cwd, '..', dirName, 'package.json');
        const chkpPackageJson = JSON.parse(readFileSync(chkpPackageJsonPath, 'utf8'));
        const chkpDeps = chkpPackageJson.dependencies || {};
        
        // Add non-@chkp dependencies to our collection with version conflict resolution
        for (const [name, version] of Object.entries(chkpDeps)) {
          if (!name.startsWith('@chkp/') && !name.startsWith('@chkp-internal/')) {
            if (collected.has(name)) {
              const existingVersion = collected.get(name);
              if (existingVersion !== version) {
                // Version conflict - use the higher version or keep existing if same major
                if (!versionConflicts.has(name)) {
                  versionConflicts.set(name, new Set([existingVersion]));
                }
                versionConflicts.get(name).add(version);
                
                // Simple resolution: use the newer version (higher major/minor)
                const existing = existingVersion.replace(/^\^/, '');
                const new_ver = version.replace(/^\^/, '');
                if (new_ver > existing) {
                  collected.set(name, version);
                  console.warn(`⚠️  Version conflict for ${name}: using ${version} (was ${existingVersion})`);
                }
              }
            } else {
              collected.set(name, version);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not read dependencies for ${depName}: ${error.message}`);
      }
    }
  }
  
  // Report version conflicts
  if (versionConflicts.size > 0) {
    console.warn('⚠️  Dependency version conflicts detected:');
    for (const [name, versions] of versionConflicts.entries()) {
      console.warn(`   ${name}: ${Array.from(versions).join(' vs ')} -> using ${collected.get(name)}`);
    }
  }
  
  return collected;
}

// Step 1: Collect dependencies from bundled @chkp packages FIRST
// This must happen before bundling decisions to ensure proper externalization
const chkpDependenciesMap = collectChkpDependencies();
const chkpDependencies = Array.from(chkpDependenciesMap.keys());

// Step 2: Get external dependencies from source package.json
const externalDeps = Object.keys(packageJson.dependencies || {});
const allRequiredDeps = [...externalDeps, ...chkpDependencies];

// Step 3: Create runtime dependency map (for dist/package.json introspection)
const runtimeDependencies = {
  ...packageJson.dependencies,
  ...Object.fromEntries(chkpDependenciesMap)
};

console.log('Bundling with explicit external dependencies:', externalDeps);
if (chkpDependencies.length > 0) {
  console.log('Additional dependencies from bundled @chkp packages:', chkpDependencies);
}
console.log('All external dependencies:', allRequiredDeps);

// Add Node.js built-in modules to external dependencies
// These are always available in Node.js runtime and should never be bundled
const allExternalDeps = [...allRequiredDeps, ...builtinModules, ...builtinModules.map(m => `node:${m}`)];

// Run ESBuild with selective bundling configuration
// This bundles @chkp packages while keeping npm dependencies external
await build({
  entryPoints: [resolve(cwd, 'src/index.ts')],  // Main entry point
  bundle: true,                                 // Enable bundling
  platform: 'node',                           // Target Node.js environment
  target: 'node20',                           // Compatible with Node.js 20+
  format: 'esm',                              // ES modules format
  outfile: resolve(cwd, 'dist/index.js'),     // Output bundled file
  // Don't set external globally - let our plugin decide everything
  plugins: [
    {
      name: 'selective-external',
      setup(build) {
        // Track what gets bundled vs external
        const bundledPackages = [];
        
        // Custom resolution logic: bundle @chkp packages, externalize everything else
        // This implements the core insight: internal packages bundled, npm deps external
        build.onResolve({ filter: /.*/ }, (args) => {
          // Skip entry points - they should never be external
          if (args.kind === 'entry-point') {
            return null;
          }
          
          // Bundle @chkp and @chkp-internal packages (our internal monorepo packages)
          if (args.path.startsWith('@chkp/') || args.path.startsWith('@chkp-internal/')) {
            bundledPackages.push(args.path);
            return null; // Let ESBuild handle normally (bundle into output)
          }
          
          // Keep Node.js built-ins external (they're provided by runtime)
          if (builtinModules.includes(args.path) || args.path.startsWith('node:')) {
            return { path: args.path, external: true };
          }
          
          // Keep npm dependencies external (they're in package.json dependencies)
          if (externalDeps.includes(args.path) || chkpDependencies.includes(args.path)) {
            return { path: args.path, external: true };
          }
          
          // For any other npm package, mark as external by default
          if (args.path.match(/^[a-zA-Z@]/)) {
            return { path: args.path, external: true };
          }
          
          // Let relative imports be bundled (local source files)
          return null;
        });
        
        build.onEnd(() => {
          // Log which internal packages were bundled for verification
          if (bundledPackages.length > 0) {
            console.log('📦 Bundled @chkp packages:', [...new Set(bundledPackages)]);
          }
          
          // Create runtime package.json in dist/ for introspection
          // NOTE: npm uses root package.json for dependency resolution,
          // but this dist/package.json is useful for debugging and tooling
          const runtimePackageJson = {
            ...packageJson,
            dependencies: runtimeDependencies
          };
          
          // Sort dependencies alphabetically for cleaner output
          const sortedDeps = {};
          Object.keys(runtimePackageJson.dependencies || {}).sort().forEach(key => {
            sortedDeps[key] = runtimePackageJson.dependencies[key];
          });
          runtimePackageJson.dependencies = sortedDeps;
          
          // Write the runtime package.json to dist/
          const distPackageJsonPath = resolve(cwd, 'dist', 'package.json');
          writeFileSync(
            distPackageJsonPath, 
            JSON.stringify(runtimePackageJson, null, 2) + '\n'
          );
          
          // Report what dependencies were collected for verification
          const collectedDeps = Object.keys(Object.fromEntries(chkpDependenciesMap));
          // Validate that all runtime dependencies are declared in package.json
          // This catches the critical issue where npm ignores dist/package.json
          if (collectedDeps.length > 0) {
            console.log('📝 Runtime dependencies collected:', collectedDeps);
            
            // Check if all collected dependencies are present in the root package.json
            // This is crucial because npm uses root package.json, not dist/package.json
            const originalPackageJson = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
            const originalDeps = Object.keys(originalPackageJson.dependencies || {});
            const missingDeps = collectedDeps.filter(dep => !originalDeps.includes(dep));
            
            if (missingDeps.length > 0) {
              // Display prominent warning about missing dependencies
              // This immediate feedback prevents broken packages from being published
              console.log('');
              console.log('🚨'.repeat(20));
              console.log('🚨 MISSING DEPENDENCIES in package.json:', missingDeps);
              console.log('🚨'.repeat(20));
              console.log('💡 Add these to the "dependencies" section of your package.json:');
              console.log('');
              for (const dep of missingDeps) {
                const version = chkpDependenciesMap.get(dep);
                console.log(`   "${dep}": "${version}",`);
              }
              console.log('');
              console.log('⚠️  Without these dependencies, your package will FAIL when installed via npm!');
              console.log('⚠️  Users will see "Cannot find package" errors at runtime.');
              console.log('🚨'.repeat(20));
              console.log('');
            } else {
              console.log('✅ All runtime dependencies are properly declared in package.json');
            }
          } else {
            console.log('📝 No external dependencies collected from @chkp packages');
          }
        });
      }
    }
  ]
});

// Build completed successfully with all validations passed
console.log('✅ Bundle complete');
