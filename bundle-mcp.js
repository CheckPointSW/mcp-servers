#!/usr/bin/env node
import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { builtinModules } from 'module';

// Get the current working directory (where the script is called from)
const cwd = process.cwd();

// Read package.json to get dependencies
const packageJson = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
const externalDeps = Object.keys(packageJson.dependencies || {});

// Add Node.js built-in modules to external dependencies
const allExternalDeps = [...externalDeps, ...builtinModules, ...builtinModules.map(m => `node:${m}`)];

console.log('Bundling with external dependencies:', externalDeps);

await build({
  entryPoints: [resolve(cwd, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: resolve(cwd, 'dist/index.js'),
  // Don't set external globally - let our plugin decide everything
  plugins: [
    {
      name: 'selective-external',
      setup(build) {
        // Track what gets bundled vs external
        const bundledPackages = [];
        
        // Mark all non-@chkp packages as external during resolution
        build.onResolve({ filter: /.*/ }, (args) => {
          // Skip entry points - they should never be external
          if (args.kind === 'entry-point') {
            return null;
          }
          
          // Bundle @chkp and @chkp-internal packages
          if (args.path.startsWith('@chkp/') || args.path.startsWith('@chkp-internal/')) {
            bundledPackages.push(args.path);
            return null; // Let esbuild handle normally (bundle)
          }
          
          // Keep built-ins and npm packages external
          if (builtinModules.includes(args.path) || args.path.startsWith('node:')) {
            return { path: args.path, external: true };
          }
          
          if (externalDeps.includes(args.path)) {
            return { path: args.path, external: true };
          }
          
          // For any other npm package, mark as external
          if (args.path.match(/^[a-zA-Z@]/)) {
            return { path: args.path, external: true };
          }
          
          // Let relative imports be handled normally (bundled)
          return null;
        });
        
        build.onEnd(() => {
          if (bundledPackages.length > 0) {
            console.log('📦 Bundled @chkp packages:', [...new Set(bundledPackages)]);
          }
        });
      }
    }
  ]
});

console.log('✅ Bundle complete');
