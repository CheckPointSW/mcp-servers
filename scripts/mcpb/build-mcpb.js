#!/usr/bin/env node
/**
 * MCPB Package Builder for Check Point MCP Servers
 * 
 * This script builds MCPB (MCP Bundle) packages for Desktop Extensions from the monorepo.
 * It bundles each MCP server package with its dependencies and creates the necessary
 * manifest.json files for MCPB format.
 * 
 * NOTE: Formerly called DXT (Desktop Extensions), this feature is now called MCPB (MCP Bundle).
 * 
 * UPDATED: This build script now supports the configuration-driven approach with
 * server-config.json files. It automatically:
 * 
 * 1. Detects MCP server packages by looking for server-config.json files
 * 2. Generates user_config and environment variables based on options in server-config.json
 * 3. Copies the server-config.json file to the built package
 * 4. Updates path references in the bundle to correctly locate server-config.json
 * 
 * When adding a new MCP server, simply:
 * 1. Create a server-config.json file in your package root
 * 2. Ensure your package uses the mcp-utils launcher
 * 3. Run this script to build an MCPB package
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..'); // Updated to account for the new folder depth
const packagesDir = path.join(rootDir, 'packages');
const mcpbBuildsDir = path.join(rootDir, 'mcpb-builds');

/**
 * Get MCP server packages from tsconfig.json references
 */
/**
 * Validates the server-config.json file for proper structure
 */
function validateServerConfig(configPath, packageName) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Basic validation
    if (!Array.isArray(config.options)) {
      console.warn(`⚠️ Warning: server-config.json for ${packageName} has no options array`);
      return false;
    }
    
    // Validate each option has required fields
    for (const option of config.options) {
      if (!option.flag) {
        console.warn(`⚠️ Warning: An option in ${packageName}'s config is missing the 'flag' field`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.warn(`⚠️ Warning: Error validating server-config.json for ${packageName}: ${error.message}`);
    return false;
  }
}

function getMcpPackages() {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error('tsconfig.json not found in root directory');
  }
  
  // Read and strip comments from JSON to handle JSONC format
  const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');
  const cleanedContent = tsconfigContent
    .replace(/\/\/.*$/gm, '')  // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments

  const tsconfig = JSON.parse(cleanedContent);
  const references = tsconfig.references || [];
  
  // Extract package names from references and filter out utility packages
  const utilityPackages = ['infra', 'gw-cli-base', 'harmony-infra', 'mcp-utils'];
  
  const mcpPackages = references
    .map(ref => path.basename(ref.path))
    .filter(packageName => {
      // Skip utility packages
      if (utilityPackages.includes(packageName)) {
        return false;
      }
      
      // Check if package has a server-config.json (indicates it's an MCP server)
      // Try both root directory and src directory
      const rootConfigPath = path.join(packagesDir, packageName, 'server-config.json');
      const srcConfigPath = path.join(packagesDir, packageName, 'src', 'server-config.json');
      
      if (fs.existsSync(rootConfigPath)) {
        // Validate the config file from root directory
        const isValid = validateServerConfig(rootConfigPath, packageName);
        return isValid;
      } else if (fs.existsSync(srcConfigPath)) {
        // Validate the config file from src directory
        const isValid = validateServerConfig(srcConfigPath, packageName);
        return isValid;
      }
      
      return false;
    });
  
  return mcpPackages;
}

// Get MCP server packages dynamically
const MCP_PACKAGES = getMcpPackages();

/**
 * Check if esbuild is available, install if not
 */
function ensureEsbuild() {
  try {
    execSync('npm list esbuild', { cwd: rootDir, stdio: 'ignore' });
  } catch (error) {
    console.log('Installing esbuild...');
    execSync('npm install --save-dev esbuild', { cwd: rootDir });
  }
}

/**
 * Clean and create build directories
 */
function prepareBuildDirectory() {
  console.log('🧹 Cleaning build directory...');
  if (fs.existsSync(mcpbBuildsDir)) {
    fs.rmSync(mcpbBuildsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(mcpbBuildsDir, { recursive: true });
}

/**
 * Build all packages using TypeScript
 */
function buildAllPackages() {
  console.log('🔨 Building all packages...');
  try {
    execSync('npm run build:all', { cwd: rootDir, stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to build packages:', error.message);
    process.exit(1);
  }
}

/**
 * Read package.json for a given package
 */
function readPackageJson(packageName) {
  const packageJsonPath = path.join(packagesDir, packageName, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Package ${packageName} not found at ${packageJsonPath}`);
  }
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

/**
 * Bundle a package using esbuild
 */
async function bundlePackage(packageName) {
  console.log(`📦 Bundling ${packageName}...`);
  
  const packageJson = readPackageJson(packageName);
  const buildDir = path.join(mcpbBuildsDir, packageName);
  const serverDir = path.join(buildDir, 'server');
  
  // Create directories
  fs.mkdirSync(serverDir, { recursive: true });
  
  // Entry point
  const entryPoint = path.join(packagesDir, packageName, 'dist', 'index.js');
  const outputFile = path.join(serverDir, 'index.js');
  
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Entry point not found: ${entryPoint}. Make sure the package is built.`);
  }
  
  // Get external dependencies (non-internal packages)
  const dependencies = packageJson.dependencies || {};
  const externalDeps = Object.keys(dependencies).filter(dep => !dep.startsWith('@chkp/'));
  
  try {
    // Dynamic import of esbuild
    const esbuild = await import('esbuild');
    
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs', // Use CommonJS instead of ESM to avoid dynamic require issues
      outfile: outputFile,
      external: externalDeps, // Only external npm packages, not internal @chkp packages
      sourcemap: false,
      minify: false, // Keep readable for debugging
      logLevel: 'warning',
      // Suppress known warnings
      logOverride: {
        'empty-import-meta': 'silent' // Suppress the import.meta warnings
      }
      // We'll handle import.meta.url replacements in post-processing instead
    });
    
    // Handle import.meta.url references and add shebang
    let bundledContent = fs.readFileSync(outputFile, 'utf8');
    
    // Add require for url module at the top if it's not already there
    if (!bundledContent.includes('const url = require("url");') && 
        !bundledContent.includes('var url = require("url");')) {
      bundledContent = 'const url = require("url");\n' + bundledContent;
    }
    
    // First: replace all fileURLToPath(import.meta.url) patterns
    bundledContent = bundledContent.replace(
      /fileURLToPath\(import\.meta\.url\)/g, 
      '__filename'
    );
    bundledContent = bundledContent.replace(
      /fileURLToPath\(import_meta\.url\)/g, 
      '__filename'
    );
    
    // Second: replace any remaining import.meta.url references
    bundledContent = bundledContent.replace(
      /import_meta\.url/g, 
      'url.pathToFileURL(__filename).toString()'
    );
    bundledContent = bundledContent.replace(
      /import\.meta\.url/g, 
      'url.pathToFileURL(__filename).toString()'
    );
    
    // Third: fix server-config.json path references to point to the local config
    const configPathPatterns = [
      // Various path patterns for server-config.json references
      /path\.join\(dirname\(__filename\), ['"]\.\.\/server-config\.json['"]\)/g,
      /path\.join\(dirname\(__filename\), ['"]server-config\.json['"]\)/g,
      /path\.join\(dirname\(__filename\), ['"]\.\.\/src\/server-config\.json['"]\)/g,
      /path\.join\(dirname\(__filename\), ['"]\.\.\/\.\.\/server-config\.json['"]\)/g,
      // In case some patterns weren't caught by the first replacement
      /path\.join\(dirname\(fileURLToPath\([^)]+\)\), ['"]\.\.\/server-config\.json['"]\)/g,
      /path\.join\(dirname\(fileURLToPath\([^)]+\)\), ['"]server-config\.json['"]\)/g,
      /path\.join\(dirname\(fileURLToPath\([^)]+\)\), ['"]\.\.\/src\/server-config\.json['"]\)/g,
      /path\.join\(dirname\(fileURLToPath\([^)]+\)\), ['"]\.\.\/\.\.\/server-config\.json['"]\)/g
    ];
    
    // Apply all config path replacements
    configPathPatterns.forEach(pattern => {
      bundledContent = bundledContent.replace(pattern, 'path.join(__dirname, "server-config.json")');
    });
    
    // Handle shebang lines
    const shebangs = bundledContent.match(/#!\/usr\/bin\/env node/g) || [];
    
    // Remove all shebang lines first
    bundledContent = bundledContent.replace(/#!\/usr\/bin\/env node\n?/g, '');
    
    // Add a single shebang at the beginning
    bundledContent = `#!/usr/bin/env node\n${bundledContent}`;
    
    fs.writeFileSync(outputFile, bundledContent);
    
    // Make executable
    fs.chmodSync(outputFile, 0o755);
    
    console.log(`✅ Successfully bundled ${packageName}`);
    
  } catch (error) {
    console.error(`❌ Failed to bundle ${packageName}:`, error.message);
    throw error;
  }
  
  return { buildDir, serverDir, packageJson, externalDeps };
}

/**
 * Install external dependencies in the server directory
 */
function installDependencies(serverDir, externalDeps, packageJson) {
  if (externalDeps.length === 0) {
    console.log('📦 No external dependencies to install');
    return;
  }
  
  console.log(`📦 Installing dependencies: ${externalDeps.join(', ')}`);
  
  // Create package.json for the server
  const serverPackageJson = {
    name: `${packageJson.name}-server`,
    version: packageJson.version,
    main: 'index.js',
    dependencies: Object.fromEntries(
      externalDeps.map(dep => [dep, packageJson.dependencies[dep]])
    )
  };
  
  fs.writeFileSync(
    path.join(serverDir, 'package.json'),
    JSON.stringify(serverPackageJson, null, 2)
  );
  
  try {
    execSync('npm install --production', { 
      cwd: serverDir, 
      stdio: 'inherit' 
    });
    console.log('✅ Dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    throw error;
  }
}

/**
 * Generate manifest.json for MCPB
 */
function generateManifest(buildDir, packageJson, packageName) {
  console.log(`📝 Generating manifest for ${packageName}...`);
  
  // Extract clean name without scope
  const cleanName = packageJson.name.replace('@chkp/', '').replace('-mcp', '');
  const displayName = cleanName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Determine user configuration based on package type
  const userConfig = generateUserConfig(packageName, cleanName);
  
  const manifest = {
    manifest_version: "0.2", // Updated to meet MCPB CLI requirements
    name: cleanName,
    display_name: `Check Point ${displayName} MCP`,
    version: packageJson.version,
    description: packageJson.description || `MCP server for Check Point ${displayName}`,
    long_description: `This extension provides MCP (Model Context Protocol) integration for Check Point ${displayName}. It allows Claude Desktop to interact with Check Point's ${displayName} services and APIs.`,
    author: {
      name: "Check Point Software Technologies Ltd.",
      email: "support@checkpoint.com",
      url: "https://www.checkpoint.com"
    },
    repository: {
      type: "git",
      url: "https://github.com/CheckPointSW/mcp-servers"
    },
    homepage: "https://www.checkpoint.com",
    documentation: "https://github.com/CheckPointSW/mcp-servers",
    support: "https://github.com/CheckPointSW/mcp-servers/issues",
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/index.js"],
        env: generateEnvironmentVariables(packageName)
      }
    },
    tools_generated: true,
    prompts_generated: false,
    keywords: ["checkpoint", "security", "mcp", "api", cleanName],
    license: packageJson.license || "MIT",
    compatibility: {
      claude_desktop: ">=0.11.6",
      platforms: ["darwin", "win32", "linux"],
      runtimes: {
        node: ">=20.0.0"
      }
    }
  };
  
  // Add user configuration if any
  if (Object.keys(userConfig).length > 0) {
    manifest.user_config = userConfig;
  }
  
  // Write manifest
  const manifestPath = path.join(buildDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  console.log(`✅ Manifest generated at ${manifestPath}`);
  return manifestPath;
}

/**
 * Generate user configuration based on package type and server-config.json
 */
function generateUserConfig(packageName, cleanName) {
  // Start with empty config
  const userConfig = {};
  
  // Path to server config - check both root and src directory
  const rootConfigPath = path.join(packagesDir, packageName, 'server-config.json');
  const srcConfigPath = path.join(packagesDir, packageName, 'src', 'server-config.json');
  let configPath = null;
  
  // Determine which config path exists
  if (fs.existsSync(rootConfigPath)) {
    configPath = rootConfigPath;
  } else if (fs.existsSync(srcConfigPath)) {
    configPath = srcConfigPath;
  }
  
  try {
    if (configPath && fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Extract user configuration from server config options
      if (config.options && Array.isArray(config.options)) {
        config.options.forEach(option => {
          // Skip verbose and debug options
          if (option.flag === '--verbose' || option.flag === '--debug') {
            return;
          }
          
          // Extract the option name from the flag (e.g., --api-key -> API_KEY)
          const flagMatch = option.flag.match(/--([a-zA-Z0-9-]+)/);
          if (flagMatch) {
            const configName = flagMatch[1].replace(/-/g, '_').toUpperCase();
            
            // Create user config entry for this option
            userConfig[configName] = {
              type: getConfigType(option.type),
              title: option.description ? getTitleFromDescription(option.description) : toTitleCase(configName),
              description: option.description || `${toTitleCase(configName)} for ${packageName}`,
              required: option.required || false
            };
            
            // Add default value if provided, otherwise use empty string for string types
            if (option.default !== undefined) {
              userConfig[configName].default = option.default;
            } else if (getConfigType(option.type) === 'string') {
              userConfig[configName].default = "";
            }
            
            // Mark passwords and keys as sensitive
            if (configName.toLowerCase().includes('password') || 
                configName.toLowerCase().includes('key') || 
                configName.toLowerCase().includes('token') || 
                configName.toLowerCase().includes('secret')) {
              userConfig[configName].sensitive = true;
            }
          }
        });
      }
      
      return userConfig;
    } else {
      console.warn(`⚠️ No server-config.json found for ${packageName}, using default user configuration`);
      return getFallbackUserConfig(packageName);
    }
  } catch (error) {
    console.warn(`⚠️ Error reading server-config.json for ${packageName}: ${error.message}`);
    console.warn('Using default user configuration');
    return getFallbackUserConfig(packageName);
  }
}

/**
 * Get fallback user configuration when server-config.json is not available
 */
function getFallbackUserConfig(packageName) {
  const baseConfig = {
    management_host: {
      type: "string",
      title: "Management Host",
      description: "IP address or hostname of your management server",
      required: false
    },
    port: {
      type: "number",
      title: "Port",
      description: "Management server port",
      default: 443,
      required: false
    },
    api_key: {
      type: "string",
      title: "API Key",
      description: "Your management API key (if using API key authentication)",
      sensitive: true,
      required: false
    },
    username: {
      type: "string", 
      title: "Username",
      description: "Username for authentication (if using username/password authentication)",
      required: false
    },
    password: {
      type: "string",
      title: "Password", 
      description: "Password for authentication (if using username/password authentication)",
      sensitive: true,
      required: false
    },
    s1c_url: {
      type: "string",
      title: "Smart-1 Cloud URL",
      description: "Your Smart-1 Cloud tenant Web-API URL (for Smart-1 Cloud authentication)",
      required: false
    }
  };
  
  // Add package-specific configurations
  switch (packageName) {
    case 'management':
      return {
        ...baseConfig,
        verify_ssl: {
          type: "boolean",
          title: "Verify SSL Certificate",
          description: "Whether to verify SSL certificates when connecting to the management server",
          default: true
        }
      };
      
    case 'harmony-sase':
      return {
        ...baseConfig,
        region: {
          type: "string",
          title: "Region",
          description: "Your Harmony SASE region",
          required: false,
          default: "us"
        }
      };
      
    default:
      return baseConfig;
  }
}

/**
 * Convert a description to a title case string
 */
function getTitleFromDescription(description) {
  // Extract first sentence or phrase
  const firstPart = description.split(/[,.;:]/, 1)[0].trim();
  return toTitleCase(firstPart);
}

/**
 * Convert a string to title case
 */
function toTitleCase(str) {
  return str
    .split(/[_\s-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get the config type from the option type
 */
function getConfigType(optionType) {
  switch (optionType) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    default:
      return 'string';
  }
}

/**
 * Generate environment variables for mcp_config
 */
function generateEnvironmentVariables(packageName) {
  // Initialize with an empty object
  const envVars = {};
  
  // Path to server config - check both root and src directory
  const rootConfigPath = path.join(packagesDir, packageName, 'server-config.json');
  const srcConfigPath = path.join(packagesDir, packageName, 'src', 'server-config.json');
  let configPath = null;
  
  // Determine which config path exists
  if (fs.existsSync(rootConfigPath)) {
    configPath = rootConfigPath;
  } else if (fs.existsSync(srcConfigPath)) {
    configPath = srcConfigPath;
  }
  
  try {
    if (configPath && fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Extract environment variables from server config options
      if (config.options && Array.isArray(config.options)) {
        config.options.forEach(option => {
          // Only include options with env variables, and exclude verbose/debug
          if (option.env && !['VERBOSE', 'DEBUG'].includes(option.env)) {
            // Convert CLI flag to user_config name (e.g., --api-key <key> -> API_KEY)
            const flagMatch = option.flag.match(/--([a-zA-Z0-9-]+)/);
            if (flagMatch) {
              const configName = flagMatch[1].replace(/-/g, '_').toUpperCase();
              envVars[option.env] = '${user_config.' + configName + '}';
            }
          }
        });
      }
    } else {
      console.warn(`⚠️ No server-config.json found for ${packageName}`);
      console.warn(`⚠️ Environment variables will not be set. The server must handle missing configuration gracefully.`);
      // Return empty object - don't set hardcoded template strings that will be treated as literal values
      return envVars;
    }
  } catch (error) {
    console.warn(`⚠️ Error reading server-config.json for ${packageName}: ${error.message}`);
    console.warn(`⚠️ Environment variables will not be set. The server must handle missing configuration gracefully.`);
    // Return empty object - don't set hardcoded template strings that will be treated as literal values
    return envVars;
  }
  
  return envVars;
}

/**
 * Pack the MCPB extension
 */
function packMcpbExtension(buildDir, packageName) {
  console.log(`📦 Packing MCPB extension for ${packageName}...`);
  
  try {
    // Check if mcpb is available (try local first, then global)
    try {
      execSync('npx mcpb --version', { stdio: 'ignore' });
    } catch {
      execSync('which mcpb', { stdio: 'ignore' });
    }
    
    // Run mcpb pack (prefer local installation via npx)
    const result = execSync('npx mcpb pack', { 
      cwd: buildDir, 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    console.log(`✅ MCPB package created for ${packageName}`);
    console.log(result);
    
    const mcpbFile = path.join(buildDir, `${packageName}.mcpb`);
    
    if (fs.existsSync(mcpbFile)) {
      console.log(`📁 MCPB file available at: ${mcpbFile}`);
    } else {
      console.warn(`⚠️  MCPB file not found at ${mcpbFile}`);
    }
    
  } catch (error) {
    if (error.code === 1 && error.status === 127) {
      console.warn(`⚠️  MCPB CLI not found. Please install it with: npm install -g @anthropic-ai/mcpb`);
      console.warn(`⚠️  Or use the local version with: npm install --save-dev @anthropic-ai/mcpb`);
      console.log(`📁 Package ready for manual packing at: ${buildDir}`);
    } else {
      console.error(`❌ Failed to pack MCPB extension for ${packageName}:`, error.message);
      if (error.stdout) console.log('stdout:', error.stdout);
      if (error.stderr) console.log('stderr:', error.stderr);
    }
  }
}

/**
 * Build a single package
 */
async function buildPackage(packageName) {
  console.log(`\n🚀 Building MCPB package: ${packageName}`);
  console.log('='.repeat(50));
  
  try {
    // Bundle the package
    const { buildDir, serverDir, packageJson, externalDeps } = await bundlePackage(packageName);
    
    // Install dependencies
    installDependencies(serverDir, externalDeps, packageJson);
    
  // Generate manifest
  generateManifest(buildDir, packageJson, packageName);
  
  // Copy original package.json to build directory (some servers need it)
  fs.copyFileSync(
    path.join(packagesDir, packageName, 'package.json'),
    path.join(buildDir, 'package.json')
  );
  
  // Copy server-config.json if it exists (check both root and src directory)
  const rootConfigPath = path.join(packagesDir, packageName, 'server-config.json');
  const srcConfigPath = path.join(packagesDir, packageName, 'src', 'server-config.json');
  let configPath = null;
  
  // Determine which config path exists
  if (fs.existsSync(rootConfigPath)) {
    configPath = rootConfigPath;
  } else if (fs.existsSync(srcConfigPath)) {
    configPath = srcConfigPath;
  }
  
  if (configPath) {
    console.log(`📄 Copying server-config.json for ${packageName} from ${configPath}`);
    fs.copyFileSync(
      configPath,
      path.join(serverDir, 'server-config.json')
    );
  }
    
    // Pack with MCPB
    packMcpbExtension(buildDir, packageName);
    
    console.log(`✅ Successfully built MCPB package for ${packageName}`);
    
  } catch (error) {
    console.error(`❌ Failed to build package ${packageName}:`, error.message);
    throw error;
  }
}

/**
 * Clean up temporary build folders after build completion
 */
function cleanupBuildFolders() {
  console.log('\n🧹 Cleaning up temporary build folders...');
  
  try {
    if (fs.existsSync(mcpbBuildsDir)) {
      fs.rmSync(mcpbBuildsDir, { recursive: true, force: true });
      console.log(`🗑️  Removed temporary mcpb-builds folder`);
    }
    console.log('✅ Temporary build folders cleaned up successfully');
  } catch (error) {
    console.error('❌ Failed to clean up build folders:', error.message);
    // Don't exit on cleanup failure, just warn
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🏗️  Check Point MCP Servers - MCPB Package Builder');
  console.log('='.repeat(60));
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let targetPackages = [];
    
    // Parse package arguments and help
    for (const arg of args) {
      if (arg === '--help' || arg === '-h') {
        console.log(`
Usage: node build-mcpb.js [packages...]

Examples:
  node build-mcpb.js                    # Build all packages
  node build-mcpb.js management         # Build only management package
  node build-mcpb.js management harmony-sase  # Build specific packages

Note: MCPB files are built to mcpb-builds/ directory (git-ignored).
For testing, use the files directly from mcpb-builds/ or upload as CI artifacts.
`);
        process.exit(0);
      } else {
        targetPackages.push(arg);
      }
    }
    
    // Default to all packages if none specified
    if (targetPackages.length === 0) {
      targetPackages = MCP_PACKAGES;
    }
    
    // Validate packages
    for (const pkg of targetPackages) {
      if (!MCP_PACKAGES.includes(pkg)) {
        console.error(`❌ Unknown package: ${pkg}`);
        console.log(`Available packages: ${MCP_PACKAGES.join(', ')}`);
        process.exit(1);
      }
    }
    
    console.log(`📋 Building packages: ${targetPackages.join(', ')}`);
    console.log(`📁 MCPB files will be saved to mcpb-builds/ directory`);
    
    // Ensure dependencies
    ensureEsbuild();
    
    // Prepare build environment
    prepareBuildDirectory();
    
    // Build all TypeScript packages first
    buildAllPackages();
    
    // Build each package
    for (const packageName of targetPackages) {
      await buildPackage(packageName);
    }
    
    // Note: Keep mcpb-builds directory for testing and CI artifacts
    // Don't clean up - let the files remain for use
    
    console.log('\n🎉 All packages built successfully!');
    
    // Show summary
    console.log('\n📊 Build Summary:');
    console.log('='.repeat(50));
    for (const packageName of targetPackages) {
      const mcpbBuildsFile = path.join(mcpbBuildsDir, packageName, `${packageName}.mcpb`);
      
      if (fs.existsSync(mcpbBuildsFile)) {
        console.log(`${packageName}.mcpb: ✅ mcpb-builds/${packageName}/`);
      } else {
        console.log(`${packageName}.mcpb: ❌ Not found`);
      }
    }
    
    console.log('\n💡 Next steps:');
    console.log('1. Test MCPB files directly from mcpb-builds/ directory');
    console.log('2. For CI: Upload mcpb-builds/**/*.mcpb as artifacts');
    console.log('3. For releases: Attach mcpb-builds/**/*.mcpb to GitHub releases');
    console.log('4. If MCPB CLI is not installed: npm install -g @anthropic-ai/mcpb');
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}

export { buildPackage, MCP_PACKAGES };
