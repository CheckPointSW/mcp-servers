// Configuration Modal Handler for Check Point MCP Servers

// Transform abbreviations for better website display
function transformDisplayText(text) {
    if (!text) return text;

    // Transform common abbreviations for website display
    return text
        .replace(/\bGW\b/g, 'Gateway')
        .replace(/\bs1c\b/gi, 'Smart-1 Cloud')
        .replace(/\bS1C\b/g, 'Smart-1 Cloud')
        .replace(/\bUrl\b/g, 'URL')
        .replace(/\burl\b/g, 'URL')
        .replace(/\bApi\b/g, 'API');
}

class ConfigurationManager {
    constructor() {
        this.currentServer = null;
        this.serverConfig = null;
        this.configCache = new Map();
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Modal controls
        document.getElementById('closeModalBtn')?.addEventListener('click', () => this.closeModal());
        document.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal());
        document.getElementById('configModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'configModal') this.closeModal();
        });

        // Preview tab switching
        document.querySelectorAll('.preview-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchPreview(e.target.dataset.preview));
        });

        // Configuration actions
        document.getElementById('saveToClaudeBtn')?.addEventListener('click', () => this.saveToClaudeDesktop());
        document.getElementById('saveToVSCodeBtn')?.addEventListener('click', () => this.saveToVSCode());

        // Dynamic form updates
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('field-input')) {
                this.updatePreview();
                this.validateField(e.target);
            }
        });
    }

    async showConfigurationModal(serverName) {
        console.log('Opening configuration for:', serverName);
        
        const server = mcpServers.find(s => s.name === serverName);
        if (!server) {
            console.error('Server not found:', serverName);
            return;
        }

        this.currentServer = server;
        this.showLoading(true);

        try {
            // Clear any cached config to force fresh load for debugging
            const cacheKey = server.package;
            this.configCache.delete(cacheKey);
            
            // Load server configuration from public repo
            await this.loadServerConfig(server);
            
            // Populate modal
            this.populateModalInfo(server);
            this.updateConfigFields();
            this.updatePreview();
            
            // Show modal
            document.getElementById('configModal').classList.add('active');
            document.body.style.overflow = 'hidden';
            
        } catch (error) {
            console.error('Error loading server configuration:', error);
            this.showError('Failed to load server configuration. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    async loadServerConfig(server) {
        // Check cache first
        const cacheKey = server.package;
        if (this.configCache.has(cacheKey)) {
            this.serverConfig = this.configCache.get(cacheKey);
            return;
        }

        // Map server package names to actual folder names in the repository
        const packageToFolderMap = {
            '@chkp/quantum-management-mcp': 'management',
            '@chkp/management-logs-mcp': 'management-logs',
            '@chkp/threat-prevention-mcp': 'threat-prevention',
            '@chkp/https-inspection-mcp': 'https-inspection',
            '@chkp/harmony-sase-mcp': 'harmony-sase',
            '@chkp/reputation-service-mcp': 'reputation-service',
            '@chkp/quantum-gw-cli-mcp': 'gw-cli',
            '@chkp/quantum-gw-connection-analysis-mcp': 'gw-cli-connection-analysis',
            '@chkp/threat-emulation-mcp': 'threat-emulation',
            '@chkp/quantum-gaia-mcp': 'gaia'
        };

        const folderName = packageToFolderMap[server.package];
        if (!folderName) {
            console.error('Unknown package:', server.package);
            this.serverConfig = this.getMinimalFallbackConfig(server);
            return;
        }

        const configUrl = `https://raw.githubusercontent.com/CheckPointSW/mcp-servers/main/packages/${folderName}/src/server-config.json`;
        
        console.log('Loading config from:', configUrl);
        
        try {
            const response = await fetch(configUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const config = await response.json();
            this.serverConfig = config;
            this.configCache.set(cacheKey, config);
            
        } catch (error) {
            console.error('Failed to load server config:', error);
            // Try alternative path structure
            const altConfigUrl = `https://raw.githubusercontent.com/CheckPointSW/mcp-servers/main/packages/${folderName}/server-config.json`;
            console.log('Trying alternative config URL:', altConfigUrl);
            
            try {
                const altResponse = await fetch(altConfigUrl);
                if (!altResponse.ok) {
                    throw new Error(`HTTP ${altResponse.status}: ${altResponse.statusText}`);
                }
                
                const config = await altResponse.json();
                this.serverConfig = config;
                this.configCache.set(cacheKey, config);
                
            } catch (altError) {
                console.error('Failed to load server config from alternative path:', altError);
                // Only use minimal fallback if both attempts fail
                this.serverConfig = this.getMinimalFallbackConfig(server);
            }
        }
    }

    getMinimalFallbackConfig(server) {
        // Minimal fallback only when actual config files are not available
        return {
            name: server.name,
            description: server.description,
            options: [
                {
                    name: "api-key",
                    description: "API key for authentication",
                    env: "API_KEY",
                    type: "string",
                    required: false
                }
            ]
        };
    }

    populateModalInfo(server) {
        document.getElementById('modalTitle').textContent = `Configure ${server.name}`;
        document.getElementById('modalServerName').textContent = server.name;
        document.getElementById('modalServerPackage').textContent = server.package;
        document.getElementById('modalServerDescription').textContent = server.description;
        document.getElementById('modalServerIcon').className = server.icon;
    }

    updateConfigFields() {
        const configFields = document.getElementById('configFields');
        
        if (!this.serverConfig) {
            configFields.innerHTML = '<p>No configuration available for this server.</p>';
            console.warn('No server config found for:', this.currentServer?.name);
            return;
        }

        console.log('Processing config for', this.currentServer?.name, ':', this.serverConfig);
        
        // Handle different possible structures in the config file
        let options = [];
        
        if (this.serverConfig.options && Array.isArray(this.serverConfig.options)) {
            options = this.serverConfig.options;
        } else if (this.serverConfig.arguments && Array.isArray(this.serverConfig.arguments)) {
            options = this.serverConfig.arguments;
        } else if (this.serverConfig.parameters && Array.isArray(this.serverConfig.parameters)) {
            options = this.serverConfig.parameters;
        } else if (this.serverConfig.config && Array.isArray(this.serverConfig.config)) {
            options = this.serverConfig.config;
        } else if (Array.isArray(this.serverConfig)) {
            options = this.serverConfig;
        } else {
            // Try to extract options from any array property
            const possibleArrays = Object.values(this.serverConfig).filter(val => Array.isArray(val));
            if (possibleArrays.length > 0) {
                options = possibleArrays[0];
                console.log('Found options in unexpected structure:', options);
            }
        }
        
        if (options.length === 0) {
            configFields.innerHTML = '<p>No configuration options found for this server.</p>';
            console.warn('No options array found in config for:', this.currentServer?.name, 'Config structure:', this.serverConfig);
            return;
        }

        console.log('Found', options.length, 'configuration options for', this.currentServer?.name, ':', options);
        
        // Show all available options
        configFields.innerHTML = options.map(field => this.createFieldHTML(field)).join('');

        this.updatePreview();
    }

    createFieldHTML(option) {
        console.log('Creating field for option:', option);
        
        // Handle different possible structures from server-config.json
        const name = option.name || option.flag || option.arg || option.parameter || 'unknown';
        const description = option.description || option.help || option.desc || option.label || name;
        
        // Generate environment variable name from the field name, not the description
        let envVar = option.env || option.environment || option.envVar || option.environmentVariable;
        if (!envVar) {
            // Clean the name to create a proper environment variable
            const cleanName = (option.name || option.flag || name)
                .replace(/^--?/, '')  // Remove leading dashes
                .replace(/<.*>/, '')  // Remove <key> parts
                .trim();
            envVar = cleanName.toUpperCase().replace(/[-\s]+/g, '_');
        }
        
        const type = option.type || option.dataType || 'string';
        const required = option.required || option.mandatory || option.isRequired || false;
        const defaultValue = option.default || option.defaultValue || option.value || '';
        
        // Handle CLI flag format (e.g., "--api-key <key>")
        let displayName = transformDisplayText(description);
        if (option.flag && option.flag.includes('<')) {
            displayName = option.flag.replace(/^--?/, '').replace(/<.*>/, '').trim();
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1).replace(/-/g, ' ');
            displayName = transformDisplayText(displayName);
        }
        
        // Only mark as required if explicitly set in the config file
        const isRequired = required === true;
        const fieldId = `field_${envVar.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const inputType = type === 'password' || envVar.includes('PASSWORD') || envVar.includes('SECRET') || envVar.includes('TOKEN') ? 'password' : 'text';
        
        return `
            <div class="field-group">
                <label class="field-label" for="${fieldId}">
                    ${displayName || transformDisplayText(description)}
                    ${isRequired ? '<span class="field-required">*</span>' : ''}
                </label>
                <input 
                    type="${inputType}" 
                    id="${fieldId}" 
                    class="field-input" 
                    data-env="${envVar}"
                    data-required="${isRequired}"
                    placeholder="${defaultValue || `Enter ${transformDisplayText(displayName || description).toLowerCase()}`}"
                    value="${defaultValue || ''}"
                />
                <div class="field-description">${transformDisplayText(this.getFieldHelp(envVar, option))}</div>
                <div class="field-error" id="${fieldId}_error"></div>
            </div>
        `;
    }

    getFieldHelp(envVar, option) {
        // Common help descriptions for known environment variables
        const commonDescriptions = {
            'API_KEY': 'Generate this from your Check Point management interface or cloud portal',
            'MANAGEMENT_HOST': 'IP address or hostname of your management server',
            'MANAGEMENT_PORT': 'Port number for API access (typically 443)',
            'USERNAME': 'Username for authentication',
            'PASSWORD': 'Password for authentication',
            'DOMAIN': 'Management domain name',
            'BASE_URL': 'Base URL for the API endpoint'
        };
        
        // Use help from the option first, then common descriptions, then generate from env var
        return option.help || 
               option.example || 
               commonDescriptions[envVar] || 
               `Configuration value for ${envVar.toLowerCase().replace(/_/g, ' ')}`;
    }

    validateField(field) {
        const errorElement = document.getElementById(`${field.id}_error`);
        const isRequired = field.dataset.required === 'false';
        const envVar = field.dataset.env;
        
        // Clear previous error
        field.classList.remove('error');
        errorElement.textContent = '';
        
        if (isRequired && !field.value.trim()) {
            field.classList.add('error');
            errorElement.textContent = 'This field is required';
            return false;
        }
        
        // Additional validation based on field type and environment variable
        if (envVar && envVar.includes('PORT') && field.value) {
            const port = parseInt(field.value);
            if (isNaN(port) || port < 1 || port > 65535) {
                field.classList.add('error');
                errorElement.textContent = 'Port must be a number between 1 and 65535';
                return false;
            }
        }
        
        if (envVar && (envVar.includes('URL') || envVar.includes('HOST')) && field.value) {
            // Basic URL/hostname validation
            if (envVar.includes('URL')) {
                try {
                    new URL(field.value);
                } catch (e) {
                    field.classList.add('error');
                    errorElement.textContent = 'Please enter a valid URL';
                    return false;
                }
            }
        }
        
        return true;
    }

    updatePreview() {
        const config = this.generateConfiguration();
        const previewMode = document.querySelector('.preview-tab.active')?.dataset.preview || 'claude';
        
        let previewText = '';
        if (previewMode === 'claude') {
            previewText = this.generateClaudeConfig(config);
        } else if (previewMode === 'vscode') {
            previewText = this.generateVSCodeConfig(config);
        }
        
        document.getElementById('configPreview').textContent = previewText;
    }

    generateConfiguration() {
        const inputs = document.querySelectorAll('.field-input');
        const config = {};
        
        inputs.forEach(input => {
            if (input.value.trim() && input.dataset.env) {
                config[input.dataset.env] = input.value.trim();
            }
        });
        
        return config;
    }

    generateClaudeConfig(envConfig) {
        const serverKey = this.currentServer.name.toLowerCase().replace(/\s+/g, '-');
        
        const config = {
            mcpServers: {
                [serverKey]: {
                    command: "npx",
                    args: [this.currentServer.package],
                    env: envConfig
                }
            }
        };
        
        return JSON.stringify(config, null, 2);
    }

    generateVSCodeConfig(envConfig) {
        const serverKey = this.currentServer.name.toLowerCase().replace(/\s+/g, '-');
        
        const config = {
            mcp: {
                servers: {
                    [serverKey]: {
                        command: "npx",
                        args: [this.currentServer.package],
                        env: envConfig
                    }
                }
            }
        };
        
        return JSON.stringify(config, null, 2);
    }

    switchPreview(previewType) {
        // Update preview tab buttons
        document.querySelectorAll('.preview-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.preview === previewType);
        });
        
        this.updatePreview();
    }

    async saveToClaudeDesktop() {
        if (!this.validateConfiguration()) {
            return;
        }
        
        const config = this.generateConfiguration();
        const configText = this.generateClaudeConfig(config);
        
        const os = this.detectOS();
        
        if (os === 'mac') {
            // macOS: Offer Node.js script + manual options
            this.showMacAutomatedInstructions('claude', configText);
        } else if (os === 'windows') {
            // Windows: Generate Node.js script for automation
            this.showWindowsAutomatedInstructions('claude', configText);
        } else {
            // Other platforms: Use upload/download workflow
            await this.editConfigWithUploadDownload('claude', configText);
        }
    }

    async saveToVSCode() {
        if (!this.validateConfiguration()) {
            return;
        }
        
        const config = this.generateConfiguration();
        const configText = this.generateVSCodeConfig(config);
        
        const os = this.detectOS();
        
        if (os === 'mac') {
            // macOS: Offer Node.js script + manual options
            this.showMacAutomatedInstructions('vscode', configText);
        } else if (os === 'windows') {
            // Windows: Generate Node.js script for automation
            this.showWindowsAutomatedInstructions('vscode', configText);
        } else {
            // Other platforms: Use upload/download workflow
            await this.editConfigWithUploadDownload('vscode', configText);
        }
    }

    validateConfiguration() {
        const inputs = document.querySelectorAll('.field-input[data-required="true"]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });
        
        if (!isValid) {
            this.showError('Please fill in all required fields correctly.');
        }
        
        return isValid;
    }

    detectOS() {    
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        if (/Mac|iPhone|iPod|iPad/.test(userAgent)) {
            return 'mac';
        } else if (/Win/.test(userAgent)) {
            return 'windows';
        } else if (/Linux/.test(userAgent)) {
            return 'linux';
        }
        
        return 'unknown';
    }

    getClaudeInstructions(os, configText) {
        const configPath = os === 'mac' 
            ? '$HOME/Library/Application Support/Claude/claude_desktop_config.json'
            : os === 'windows'
            ? '%APPDATA%\\Claude\\claude_desktop_config.json'
            : '~/.config/claude/claude_desktop_config.json';

        return `
✅ Configuration file has been downloaded to your Downloads folder!

1. Locate the downloaded 'claude_desktop_config.json' file in your Downloads

2. Move it to your Claude Desktop configuration directory:
   Location: ${configPath}

3. If a configuration file already exists:
   - Back up your existing file first
   - Merge the server configuration from the downloaded file
   - Add it to your existing "mcpServers" object

4. If no configuration file exists:
   - Simply move the downloaded file to the location above

5. Restart Claude Desktop

6. The ${this.currentServer.name} server will be available in Claude Desktop!

Note: Make sure to keep your API keys and credentials secure.
        `.trim();
    }

    getVSCodeInstructions(os, configText) {
        const configPath = os === 'mac'
            ? '$HOME/Library/Application Support/Code/User/settings.json'
            : os === 'windows'
            ? '%APPDATA%\\Code\\User\\settings.json'
            : '~/.config/Code/User/settings.json';

        return `
1. Open VS Code settings.json file:
   Location: ${configPath}
   
   Or use VS Code:
   - Press Ctrl/Cmd + Shift + P
   - Type "Preferences: Open Settings (JSON)"
   - Select the command

2. Add this MCP configuration to your settings.json:
${configText}

3. If you already have MCP servers configured, merge the new server into your existing "mcp.servers" object.

4. The ${this.currentServer.name} server will be available in VS Code!

Note: Make sure to keep your API keys and credentials secure.
        `.trim();
    }

    showInstructions(title, instructions) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <pre style="white-space: pre-wrap; font-family: inherit; background: var(--background-secondary); padding: var(--spacing-lg); border-radius: var(--radius-md); border: 1px solid var(--border-light);">${instructions}</pre>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="navigator.clipboard.writeText(\`${instructions.replace(/`/g, '\\`')}\`); this.textContent='Copied!'">
                        <i class="fas fa-copy"></i> Copy Instructions
                    </button>
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    async configureWithFileSystemAPI(platform, newConfigText) {
        const os = this.detectOS();
        
        // Show instructions for finding the file
        const configPath = this.getConfigPath(platform, os);
        const instructions = this.getFileLocationInstructions(os, configPath);
        const title = platform === 'claude' ? 'Select Claude Desktop Configuration' : 'Select VS Code Settings';
        
        this.showFileSystemInstructions(title, instructions, async () => {
            try {
                // Open file picker - start in Documents since system folders are restricted
                const fileTypes = platform === 'claude' 
                    ? [{ description: 'Claude Desktop Config', accept: { 'application/json': ['.json'] } }]
                    : [{ description: 'VS Code Settings', accept: { 'application/json': ['.json'] } }];
                    
                const [fileHandle] = await window.showOpenFilePicker({
                    types: fileTypes,
                    startIn: 'documents',
                    excludeAcceptAllOption: false
                });
                
                // Read existing content
                const file = await fileHandle.getFile();
                let existingConfig = {};
                
                if (file.size > 0) {
                    const existingText = await file.text();
                    try {
                        existingConfig = JSON.parse(existingText);
                    } catch (e) {
                        console.warn('Could not parse existing config, creating new one');
                        this.showError('Selected file contains invalid JSON. Creating new configuration...');
                    }
                }
                
                // Parse new config and merge
                const newConfig = JSON.parse(newConfigText);
                let mergedConfig;
                
                if (platform === 'claude') {
                    mergedConfig = {
                        ...existingConfig,
                        mcpServers: {
                            ...(existingConfig.mcpServers || {}),
                            ...newConfig.mcpServers
                        }
                    };
                } else {
                    // VS Code format
                    mergedConfig = {
                        ...existingConfig,
                        mcp: {
                            ...(existingConfig.mcp || {}),
                            servers: {
                                ...(existingConfig.mcp?.servers || {}),
                                ...newConfig.mcp.servers
                            }
                        }
                    };
                }
                
                // Request write permission
                if ((await fileHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
                    const permission = await fileHandle.requestPermission({ mode: 'readwrite' });
                    if (permission !== 'granted') {
                        this.showError('Write permission denied. Please try again and grant write access.');
                        return;
                    }
                }
                
                // Write merged config back
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(mergedConfig, null, 2));
                await writable.close();
                
                this.showSuccess(`✅ Successfully updated Claude Desktop configuration!\\n\\nServer "${this.currentServer.name}" has been added.\\n\\nPlease restart Claude Desktop for changes to take effect.`);
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    this.showError('File selection cancelled.');
                } else if (error.name === 'SecurityError') {
                    const configFileName = platform === 'claude' ? 'claude_desktop_config.json' : 'settings.json';
                    this.showError(`Cannot access system folders directly. Please copy your ${configFileName} to Documents folder first, then select it.`);
                } else {
                    console.error('File system API error:', error);
                    this.showError('Failed to update configuration file: ' + error.message);
                }
            }
        });
    }

    showMacAutomatedInstructions(platform, configText) {
        const serverKey = this.currentServer.name.toLowerCase().replace(/\s+/g, '-');
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        const platformSlug = platform === 'claude' ? 'claude' : 'vscode';
        const title = `Configure ${platformName} (macOS)`;
        
        // Generate unique filename with server name and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
        const scriptFileName = `add-${serverKey}-to-${platformSlug}-${timestamp}.js`;
        const configFileName = `${serverKey}-${platformSlug}-config-${timestamp}.json`;
        
        // Generate the Node.js script
        const script = this.generateMacConfigScript(platform, configText, serverKey);
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="background: #dcfce7; border: 1px solid #16a34a; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                        <h4 style="margin: 0 0 0.5rem 0; color: #166534;">🚀 Automated Configuration</h4>
                        <p style="margin: 0; color: #166534; font-size: 0.9rem;">
                            Download and run a Node.js script to automatically configure ${platformName}!
                        </p>
                    </div>
                    
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0;">Option 1: Automated Script (Recommended)</h3>
                        <p><strong>Step 1:</strong> Download the configuration script</p>
                        <button class="btn btn-primary" id="downloadScriptBtn" style="margin: 1rem 0;">
                            <i class="fas fa-download"></i> Download ${scriptFileName}
                        </button>
                        
                        <p><strong>Step 2:</strong> Run the script in Terminal</p>
                        <div style="background: var(--background-secondary); padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <code style="flex: 1; font-size: 0.9rem;">cd ~/Downloads && node ${scriptFileName}</code>
                                <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('cd ~/Downloads && node ${scriptFileName}'); this.textContent='Copied!'">
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            </div>
                        </div>
                        
                        <p><strong>Step 3:</strong> Restart ${platformName}</p>
                        <p style="color: var(--text-secondary); font-size: 0.9rem;">
                            💡 The script will automatically backup your existing configuration and add the new server.
                        </p>
                    </div>
                    
                    <div style="border-top: 1px solid var(--border-light); padding-top: 2rem;">
                        <h3 style="margin: 0 0 1rem 0;">Option 2: Manual Configuration</h3>
                        <p>If you prefer manual setup, download the configuration:</p>
                        <button class="btn btn-outline" id="downloadConfigBtn" style="margin: 1rem 0;">
                            <i class="fas fa-download"></i> Download ${configFileName}
                        </button>
                        <p style="color: var(--text-secondary); font-size: 0.9rem;">
                            Then manually merge with your existing <code>${this.getConfigPath(platform, 'mac')}</code>
                        </p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle script download
        modal.querySelector('#downloadScriptBtn').addEventListener('click', () => {
            this.downloadFile(scriptFileName, script);
            this.showSuccess(`Script downloaded as ${scriptFileName}! Run it in Terminal to automatically configure ${platformName}.`);
        });
        
        // Handle config download
        modal.querySelector('#downloadConfigBtn').addEventListener('click', () => {
            this.downloadFile(configFileName, configText);
            this.showSuccess(`Configuration downloaded as ${configFileName}! Manually merge with your existing config file.`);
        });
    }

    generateMacConfigScript(platform, configText, serverKey) {
        const config = JSON.parse(configText);
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        const serverConfig = platform === 'claude' ? config.mcpServers[serverKey] : config.mcp.servers[serverKey];
        const configPath = this.getConfigPath(platform, 'mac');
        
        return `#!/usr/bin/env node
/**
 * ${platformName} Configuration Updater
 * Automatically adds ${this.currentServer.name} to your ${platformName} configuration
 * 
 * Generated by Check Point MCP Servers Configuration Tool
 * Server: ${this.currentServer.name}
 * Package: ${this.currentServer.package}
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration to add
const NEW_SERVER_CONFIG = ${JSON.stringify(serverConfig, null, 2)};
const SERVER_NAME = '${serverKey}';

// ${platformName} config path
const CONFIG_PATH = '${configPath}'.replace('~', os.homedir());
const BACKUP_PATH = CONFIG_PATH + '.backup.' + Date.now();

function main() {
    console.log('🚀 ${platformName} Configuration Updater');
    console.log('Adding server:', SERVER_NAME);
    console.log('Package:', '${this.currentServer.package}');
    console.log('');
    
    try {
        // Check if config directory exists
        const configDir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(configDir)) {
            console.log('📁 Creating ${platformName} configuration directory...');
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Read existing configuration
        let existingConfig = {};
        if (fs.existsSync(CONFIG_PATH)) {
            console.log('📖 Reading existing configuration...');
            const existingText = fs.readFileSync(CONFIG_PATH, 'utf8');
            
            // Create backup
            console.log('💾 Creating backup:', path.basename(BACKUP_PATH));
            fs.writeFileSync(BACKUP_PATH, existingText);
            
            try {
                existingConfig = JSON.parse(existingText);
            } catch (e) {
                console.warn('⚠️  Existing config has invalid JSON, creating new one');
                existingConfig = {};
            }
        } else {
            console.log('📄 No existing configuration found, creating new one...');
        }
        
        // Merge configurations based on platform
        let mergedConfig;
        if ('${platform}' === 'claude') {
            mergedConfig = {
                ...existingConfig,
                mcpServers: {
                    ...(existingConfig.mcpServers || {}),
                    [SERVER_NAME]: NEW_SERVER_CONFIG
                }
            };
        } else {
            // VS Code format
            mergedConfig = {
                ...existingConfig,
                mcp: {
                    ...(existingConfig.mcp || {}),
                    servers: {
                        ...(existingConfig.mcp?.servers || {}),
                        [SERVER_NAME]: NEW_SERVER_CONFIG
                    }
                }
            };
        }
        
        // Write updated configuration
        console.log('✏️  Writing updated configuration...');
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2));
        
        console.log('');
        console.log('✅ Successfully updated ${platformName} configuration!');
        console.log('🔄 Please restart ${platformName} for changes to take effect.');
        console.log('');
        console.log('Server added:', SERVER_NAME);
        console.log('Backup created:', path.basename(BACKUP_PATH));
        
    } catch (error) {
        console.error('❌ Error updating configuration:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
`;
    }

    showWindowsAutomatedInstructions(platform, configText) {
        const serverKey = this.currentServer.name.toLowerCase().replace(/\s+/g, '-');
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        const title = `Configure ${platformName} (Windows)`;
        
        // Generate unique filename with server name and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const scriptFileName = `add-${serverKey}-to-${platform}-${timestamp}.js`;
        const configFileName = `${serverKey}-${platform}-config-${timestamp}.json`;
        
        // Generate the Node.js script for Windows
        const script = this.generateWindowsConfigScript(platform, configText, serverKey);
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="config-method-choice">
                        <h3>Choose your preferred method:</h3>
                        
                        <div class="method-option recommended">
                            <div class="method-header">
                                <h4><i class="fas fa-terminal"></i> Automated Setup (Recommended)</h4>
                                <span class="method-badge">Easy</span>
                            </div>
                            <p>Download and run a Node.js script that automatically configures ${platformName}.</p>
                            <div class="method-actions">
                                <button class="btn btn-primary" id="downloadScriptBtn">
                                    <i class="fas fa-download"></i> Download ${scriptFileName}
                                </button>
                            </div>
                            <div class="method-instructions">
                                <h5>Steps:</h5>
                                <ol>
                                    <li>Click the download button above to get <code>${scriptFileName}</code></li>
                                    <li>Open <strong>Command Prompt</strong> or <strong>PowerShell</strong></li>
                                    <li>Navigate to your Downloads folder:<br>
                                        <div class="code-block">
                                            <code>cd %USERPROFILE%\\Downloads</code>
                                            <button class="copy-btn" onclick="navigator.clipboard.writeText('cd %USERPROFILE%\\\\Downloads'); this.innerHTML='✓ Copied'">Copy</button>
                                        </div>
                                    </li>
                                    <li>Run the configuration script:<br>
                                        <div class="code-block">
                                            <code>node ${scriptFileName}</code>
                                            <button class="copy-btn" onclick="navigator.clipboard.writeText('node ${scriptFileName}'); this.innerHTML='✓ Copied'">Copy</button>
                                        </div>
                                    </li>
                                </ol>
                                <div class="info-box">
                                    <i class="fas fa-info-circle"></i>
                                    <strong>Requirements:</strong> Node.js must be installed. Download from <a href="https://nodejs.org/" target="_blank">nodejs.org</a>
                                </div>
                            </div>
                        </div>
                        
                        <div class="method-option">
                            <div class="method-header">
                                <h4><i class="fas fa-file-edit"></i> Manual Configuration</h4>
                                <span class="method-badge">Advanced</span>
                            </div>
                            <p>Download the configuration file and manually place it in the correct location.</p>
                            <div class="method-actions">
                                <button class="btn btn-outline" id="downloadConfigFileBtn">
                                    <i class="fas fa-download"></i> Download Config File
                                </button>
                            </div>
                            <div class="method-instructions">
                                <h5>Manual Steps:</h5>
                                <ol>
                                    <li>Download the config file above</li>
                                    <li>Press <strong>Win + R</strong>, type the path below, and press Enter:<br>
                                        <div class="code-block">
                                            <code>%APPDATA%\\${platform === 'claude' ? 'Claude' : 'Code\\User'}</code>
                                            <button class="copy-btn" onclick="navigator.clipboard.writeText('%APPDATA%\\\\${platform === 'claude' ? 'Claude' : 'Code\\\\User'}'); this.innerHTML='✓ Copied'">Copy</button>
                                        </div>
                                    </li>
                                    <li>Replace or merge with your existing <code>${platform === 'claude' ? 'claude_desktop_config.json' : 'settings.json'}</code></li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners for download buttons
        modal.querySelector('#downloadScriptBtn')?.addEventListener('click', () => {
            this.downloadFile(scriptFileName, script);
        });
        
        modal.querySelector('#downloadConfigFileBtn')?.addEventListener('click', () => {
            this.downloadFile(configFileName, configText);
        });
    }

    generateWindowsConfigScript(platform, configText, serverKey) {
        let serverConfig;
        try {
            const parsedConfig = JSON.parse(configText);
            if (platform === 'claude') {
                serverConfig = parsedConfig.mcpServers && parsedConfig.mcpServers[serverKey];
            } else {
                serverConfig = parsedConfig.mcp && parsedConfig.mcp.servers && parsedConfig.mcp.servers[serverKey];
            }
            
            if (!serverConfig) {
                throw new Error(`Server configuration not found for key: ${serverKey}`);
            }
        } catch (error) {
            console.error('Error parsing config:', error);
            throw new Error('Invalid configuration format or missing server data');
        }
        
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        const configPath = platform === 'claude' 
            ? 'process.env.APPDATA + "\\\\Claude\\\\claude_desktop_config.json"'
            : 'process.env.APPDATA + "\\\\Code\\\\User\\\\settings.json"';
        
        return `const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const NEW_SERVER_CONFIG = ${JSON.stringify(serverConfig, null, 2)};
const SERVER_NAME = '${serverKey}';
const CONFIG_PATH = ${configPath};
const BACKUP_PATH = CONFIG_PATH + '.backup.' + Date.now();

console.log('==========================================');
console.log('   ${platformName} Configuration Updater');
console.log('==========================================');
console.log('');
console.log('Adding server:', SERVER_NAME);
console.log('Package: ${this.currentServer.package}');
console.log('');

function main() {
    try {
        const configDir = path.dirname(CONFIG_PATH);
        
        // Create config directory if it doesn't exist
        if (!fs.existsSync(configDir)) {
            console.log('Creating configuration directory...');
            fs.mkdirSync(configDir, { recursive: true });
        }

        let existingConfig = {};
        
        // Read existing configuration if it exists
        if (fs.existsSync(CONFIG_PATH)) {
            console.log('Reading existing configuration...');
            const existingText = fs.readFileSync(CONFIG_PATH, 'utf8');
            
            // Create backup
            console.log('Creating backup:', path.basename(BACKUP_PATH));
            fs.writeFileSync(BACKUP_PATH, existingText);
            
            try {
                existingConfig = JSON.parse(existingText);
            } catch (e) {
                console.warn('Invalid JSON in existing config, creating new one');
            }
        } else {
            console.log('No existing configuration found, creating new one...');
        }

        // Merge configurations
        let mergedConfig;
        ${platform === 'claude' ? 
            'mergedConfig = { ...existingConfig, mcpServers: { ...(existingConfig.mcpServers || {}), [SERVER_NAME]: NEW_SERVER_CONFIG } };' :
            'mergedConfig = { ...existingConfig, mcp: { ...(existingConfig.mcp || {}), servers: { ...(existingConfig.mcp?.servers || {}), [SERVER_NAME]: NEW_SERVER_CONFIG } } };'
        }

        // Write updated configuration
        console.log('Writing updated configuration...');
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2));
        
        console.log('');
        console.log('✅ Successfully updated ${platformName} configuration!');
        console.log('');
        console.log('Server added:', SERVER_NAME);
        console.log('Configuration file:', CONFIG_PATH);
        
    } catch (error) {
        console.error('❌ Error updating configuration:', error.message);
        process.exit(1);
    }
}

main();
`;
    }

    async editConfigWithUploadDownload(platform, newConfigText) {
        const os = this.detectOS();
        const configPath = this.getConfigPath(platform, os);
        const instructions = this.getFileLocationInstructions(os, configPath);
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        
        this.showUploadDownloadInstructions(`Configure ${platformName}`, instructions, newConfigText, platform);
    }

    getFileLocationInstructions(os, configPath) {
        if (os === 'mac') {
            return {
                path: configPath,
                shortcut: '⌘⇧G',
                instruction: 'In the file picker, press ⌘⇧G and paste the path above',
                copyPath: '~/Library/Application Support/Claude/'
            };
        } else if (os === 'windows') {
            return {
                path: configPath,
                shortcut: 'Address Bar',
                instruction: 'Click the address bar in the file picker and paste the path above',
                copyPath: '%APPDATA%\\Claude\\'
            };
        } else {
            return {
                path: configPath,
                shortcut: 'Navigate',
                instruction: 'Navigate to the path above in the file picker',
                copyPath: '~/.config/claude/'
            };
        }
    }

    getConfigPath(platform, os) {
        if (platform === 'claude') {
            return os === 'mac' 
                ? '~/Library/Application Support/Claude/claude_desktop_config.json'
                : os === 'windows'
                ? '%APPDATA%\\Claude\\claude_desktop_config.json'
                : '~/.config/claude/claude_desktop_config.json';
        } else {
            // VS Code
            return os === 'mac'
                ? '~/Library/Application Support/Code/User/settings.json'
                : os === 'windows'
                ? '%APPDATA%\\Code\\User\\settings.json'
                : '~/.config/Code/User/settings.json';
        }
    }

    showFileSystemInstructions(title, pathInfo, onProceed) {
        const platform = title.includes('Claude') ? 'claude' : 'vscode';
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        const configFileName = platform === 'claude' ? 'claude_desktop_config.json' : 'settings.json';
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 650px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="background: #dcfce7; border: 1px solid #16a34a; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                        <h4 style="margin: 0 0 0.5rem 0; color: #166534;">🚀 Automated Configuration</h4>
                        <p style="margin: 0; color: #166534; font-size: 0.9rem;">
                            Windows users can directly edit the ${platformName} configuration file!
                        </p>
                    </div>
                    
                    <p><strong>Step 1:</strong> When the file picker opens, navigate to your ${platformName} configuration folder</p>
                    <div style="background: var(--background-secondary); padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                        <p style="margin: 0 0 0.5rem 0;"><strong>Navigate to:</strong></p>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <code style="flex: 1; font-size: 0.9rem;">${pathInfo.copyPath}</code>
                            <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${pathInfo.copyPath}'); this.textContent='Copied!'">
                                <i class="fas fa-copy"></i> Copy Path
                            </button>
                        </div>
                        <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">
                            💡 <strong>Tip:</strong> Click the address bar in the file picker and paste the path above
                        </p>
                    </div>
                    
                    <p><strong>Step 2:</strong> Select the <code>${configFileName}</code> file</p>
                    
                    <p><strong>Step 3:</strong> The configuration will be automatically updated!</p>
                    
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">
                        💡 <strong>Note:</strong> If the file doesn't exist, create an empty <code>${configFileName}</code> file with <code>{}</code> content first.
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="proceedBtn">
                        <i class="fas fa-folder-open"></i> Open File Picker
                    </button>
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#proceedBtn').addEventListener('click', () => {
            modal.remove();
            onProceed();
        });
    }

    showUploadDownloadInstructions(title, pathInfo, configText, platform) {
        const platformName = platform === 'claude' ? 'Claude Desktop' : 'VS Code';
        const configFileName = platform === 'claude' ? 'claude_desktop_config.json' : 'settings.json';
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 2rem;">
                        <h3>Option 1: Update Existing Configuration</h3>
                        <p><strong>Step 1:</strong> Locate your ${platformName} configuration file</p>
                        <div style="background: var(--background-secondary); padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <code style="flex: 1; font-size: 0.9rem;">${pathInfo.copyPath}</code>
                                <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${pathInfo.copyPath}'); this.textContent='Copied!'">
                                    <i class="fas fa-copy"></i> Copy Path
                                </button>
                            </div>
                        </div>
                        <p><strong>Step 2:</strong> ${pathInfo.instruction}</p>
                        <p><strong>Step 3:</strong> Upload your existing <code>${configFileName}</code> file:</p>
                        <input type="file" id="configUpload" accept=".json" style="margin: 1rem 0; padding: 0.5rem; border: 2px dashed var(--border-light); border-radius: 8px; width: 100%;">
                        <div id="uploadResult" style="margin: 1rem 0;"></div>
                    </div>
                    
                    <div style="border-top: 1px solid var(--border-light); padding-top: 2rem;">
                        <h3>Option 2: Download New Configuration</h3>
                        <p>If you don't have an existing configuration file, download a new one:</p>
                        <button class="btn btn-primary" id="downloadNewBtn">
                            <i class="fas fa-download"></i> Download New Configuration
                        </button>
                        <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.9rem;">
                            Then place the downloaded file at: <code>${pathInfo.path}</code>
                        </p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle file upload
        const uploadInput = modal.querySelector('#configUpload');
        const uploadResult = modal.querySelector('#uploadResult');
        
        uploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                let existingConfig = {};
                
                try {
                    existingConfig = JSON.parse(text);
                } catch (err) {
                    uploadResult.innerHTML = '<p style="color: var(--danger-color);">❌ Invalid JSON file. Please check your configuration file.</p>';
                    return;
                }
                
                // Merge configurations
                const newConfig = JSON.parse(configText);
                let mergedConfig;
                
                if (platform === 'claude') {
                    mergedConfig = {
                        ...existingConfig,
                        mcpServers: {
                            ...(existingConfig.mcpServers || {}),
                            ...newConfig.mcpServers
                        }
                    };
                } else {
                    // VS Code format
                    mergedConfig = {
                        ...existingConfig,
                        mcp: {
                            ...(existingConfig.mcp || {}),
                            servers: {
                                ...(existingConfig.mcp?.servers || {}),
                                ...newConfig.mcp.servers
                            }
                        }
                    };
                }
                
                // Show download button for merged config
                uploadResult.innerHTML = `
                    <div style="background: var(--success-background, #f0f9ff); padding: 1rem; border-radius: 8px; border: 1px solid var(--success-color, #10b981);">
                        <p style="color: var(--success-color, #10b981); margin: 0 0 1rem 0;">✅ Configuration merged successfully!</p>
                        <button class="btn btn-primary" id="downloadMergedBtn">
                            <i class="fas fa-download"></i> Download Updated Configuration
                        </button>
                        <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                            Replace your existing file with the downloaded version and restart ${platformName}.
                        </p>
                    </div>
                `;
                
                modal.querySelector('#downloadMergedBtn').addEventListener('click', () => {
                    this.downloadFile(configFileName, JSON.stringify(mergedConfig, null, 2));
                    this.showSuccess(`Configuration file downloaded! Replace your existing file and restart ${platformName}.`);
                });
                
            } catch (error) {
                console.error('Error processing uploaded file:', error);
                uploadResult.innerHTML = '<p style="color: var(--danger-color);">❌ Error processing file. Please try again.</p>';
            }
        });
        
        // Handle new file download
        modal.querySelector('#downloadNewBtn').addEventListener('click', () => {
            this.downloadFile(configFileName, configText);
            this.showSuccess(`New configuration file downloaded! Place it at the specified location and restart ${platformName}.`);
        });
    }

    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    showSuccess(message) {
        // Simple success notification - can be enhanced with a proper toast system
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--success-color, #10b981);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: inherit;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    showError(message) {
        // Simple error toast - can be enhanced with a proper toast system
        alert(message);
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    }

    closeModal() {
        document.getElementById('configModal').classList.remove('active');
        document.body.style.overflow = '';
        
        // Reset form
        this.currentServer = null;
        this.serverConfig = null;
    }
}

// Initialize configuration manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.configManager = new ConfigurationManager();
});

// Export for use in main.js
window.ConfigurationManager = ConfigurationManager;
