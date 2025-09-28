// Check Point MCP Servers - Main JavaScript

// Cache for dynamically loaded servers
let mcpServers = [];
let serversLoaded = false;

// Static fallback data in case README parsing fails
const fallbackServers = [
    {
        name: "Management",
        package: "@chkp/quantum-management-mcp",
        description: "Query policies, rules, objects, and network topology",
        icon: "fas fa-cogs",
        repoPath: "./packages/management/"
    },
    // Minimal fallback - will be replaced by dynamic loading
];

// Dynamic server loading from README
async function loadMCPServersFromReadme() {
    if (serversLoaded) return mcpServers;
    
    try {
        console.log('Loading MCP servers from README...');
        
        // Fetch README from public repository
        const response = await fetch('https://raw.githubusercontent.com/CheckPointSW/mcp-servers/main/README.md');
        if (!response.ok) {
            throw new Error(`Failed to fetch README: ${response.status}`);
        }
        
        const readmeText = await response.text();
        mcpServers = parseMCPServersFromReadme(readmeText);
        
        if (mcpServers.length === 0) {
            throw new Error('No servers found in README');
        }
        
        console.log(`Successfully loaded ${mcpServers.length} MCP servers from README`);
        serversLoaded = true;
        return mcpServers;
        
    } catch (error) {
        console.error('Failed to load servers from README:', error);
        console.log('Using fallback server data');
        mcpServers = fallbackServers;
        serversLoaded = true;
        return mcpServers;
    }
}

// Parse MCP servers from README markdown table
function parseMCPServersFromReadme(readmeText) {
    const servers = [];
    
    try {
        // Find the "Available MCP Servers" section - use simpler approach
        const sectionStart = readmeText.indexOf('## Available MCP Servers');
        if (sectionStart === -1) {
            console.error('Could not find "Available MCP Servers" section in README');
            return [];
        }
        
        // Find the start of the table (look for the header row)
        const tableStart = readmeText.indexOf('| MCP Server | Package Name | Description |', sectionStart);
        if (tableStart === -1) {
            console.error('Could not find table header in Available MCP Servers section');
            return [];
        }
        
        // Find the end of the table (look for the next ## section or end of file)
        const nextSectionStart = readmeText.indexOf('\n## ', tableStart);
        const tableEnd = nextSectionStart === -1 ? readmeText.length : nextSectionStart;
        
        // Extract just the table content
        const tableContent = readmeText.substring(tableStart, tableEnd);
        console.log('Extracted table content length:', tableContent.length);
        
        return parseTableContent(tableContent);
        
    } catch (error) {
        console.error('Error parsing README:', error);
        return [];
    }
}

// Helper function to parse table content
function parseTableContent(tableContent) {
    const servers = [];
    
    try {
        console.log('Table content length:', tableContent.length);
        console.log('Table content preview:', tableContent.substring(0, 500) + '...');
        
        // Extract table rows (skip header and separator)
        const tableRows = tableContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('|') && !line.includes('---'))
            .slice(1); // Skip header row
        
        console.log(`Found ${tableRows.length} table rows`);
        console.log('All table rows:', tableRows);

        for (const row of tableRows) {
            const server = parseServerTableRow(row);
            if (server) {
                servers.push(server);
            }
        }

        console.log(`Parsed ${servers.length} servers from table`);
        
        // Debug: List all parsed servers
        console.log('All parsed servers:');
        servers.forEach((server, index) => {
            console.log(`${index + 1}. ${server.name} (${server.package}) - Category: ${server.category}`);
        });
        
        return servers;
        
    } catch (error) {
        console.error('Error parsing table content:', error);
        return [];
    }
}// Parse individual server table row
function parseServerTableRow(row) {
    try {
        // Split by | and clean up
        const columns = row.split('|')
            .map(col => col.trim())
            .filter(col => col.length > 0);
        
        if (columns.length < 3) {
            console.warn('Invalid table row:', row);
            return null;
        }
        
        // Extract server name from markdown link [Name](path)
        const nameMatch = columns[0].match(/\[([^\]]+)\]/);
        const name = nameMatch ? nameMatch[1] : columns[0];
        
        // Extract repo path from markdown link
        const pathMatch = columns[0].match(/\(([^)]+)\)/);
        const repoPath = pathMatch ? pathMatch[1] : '';
        
        // Extract package name (remove backticks if present)
        const packageName = columns[1].replace(/`/g, '').trim();
        
        // Get description
        const description = columns[2].trim();
        
        // Generate additional metadata (without features)
        const server = {
            name: name,
            package: packageName,
            description: description,
            repoPath: repoPath,
            icon: getIconForServer(name),
            category: getCategoryForServer(name),
            publicRepo: `https://github.com/CheckPointSW/mcp-servers/tree/main/${repoPath.replace('./', '')}`,
            mcpbDownload: generateMCPBDownloadUrl(repoPath, name),
            npmPackage: `https://www.npmjs.com/package/${packageName}`
        };
        
        return server;
        
    } catch (error) {
        console.error('Error parsing server row:', row, error);
        return null;
    }
}

// Generate DXT download URL based on repo path and name
function generateMCPBDownloadUrl(repoPath, name) {
    // Extract package name from the repo path (e.g., "./packages/gaia" -> "gaia")
    const packageName = repoPath.replace('./packages/', '').replace('./', '').replace(/\/$/, '');
    return `https://github.com/CheckPointSW/mcp-servers/releases/latest/download/${packageName}.mcpb`;
}

// Generate icon based on server name/type (algorithmic approach)
function getIconForServer(name) {
    const nameLower = name.toLowerCase();
    
    // Security-related servers
    if (nameLower.includes('threat') || nameLower.includes('prevention')) {
        return 'fas fa-shield-virus';
    }
    if (nameLower.includes('https') || nameLower.includes('inspection') || nameLower.includes('ssl')) {
        return 'fas fa-lock';
    }
    if (nameLower.includes('emulation') || nameLower.includes('malware')) {
        return 'fas fa-bug';
    }
    
    // Infrastructure and management
    if (nameLower.includes('management') && nameLower.includes('log')) {
        return 'fas fa-file-alt';
    }
    if (nameLower.includes('management') || nameLower.includes('policy')) {
        return 'fas fa-cogs';
    }
    if (nameLower.includes('cli') || nameLower.includes('gateway') || nameLower.includes('gw')) {
        return 'fas fa-server';
    }
    if (nameLower.includes('network') || nameLower.includes('connection')) {
        return 'fas fa-network-wired';
    }
    if (nameLower.includes('gaia') || nameLower.includes('interface')) {
        return 'fas fa-sitemap';
    }
    
    // Cloud and services
    if (nameLower.includes('cloud') || nameLower.includes('sase') || nameLower.includes('harmony')) {
        return 'fas fa-cloud';
    }
    if (nameLower.includes('reputation') || nameLower.includes('intelligence')) {
        return 'fas fa-search';
    }
    
    // Default fallback
    return 'fas fa-cogs';
}

// Generate category based on server name/type (algorithmic approach)
function getCategoryForServer(name) {
    const nameLower = name.toLowerCase();
    
    // Security categories
    if (nameLower.includes('threat') || nameLower.includes('prevention') || 
        nameLower.includes('emulation') || nameLower.includes('https') || 
        nameLower.includes('inspection')) {
        return 'Security';
    }
    
    // Management and logging
    if (nameLower.includes('log') || nameLower.includes('audit')) {
        return 'Logging';
    }
    if (nameLower.includes('management') || nameLower.includes('policy')) {
        return 'Management';
    }
    
    // Infrastructure and diagnostics
    if (nameLower.includes('cli') || nameLower.includes('gateway') || nameLower.includes('gw')) {
        return nameLower.includes('connection') || nameLower.includes('analysis') ? 'Diagnostics' : 'Infrastructure';
    }
    if (nameLower.includes('gaia') || nameLower.includes('interface') || nameLower.includes('network')) {
        return 'System Management';
    }
    
    // Cloud and intelligence
    if (nameLower.includes('cloud') || nameLower.includes('sase') || nameLower.includes('harmony')) {
        return 'Cloud Security';
    }
    if (nameLower.includes('reputation') || nameLower.includes('intelligence')) {
        return 'Threat Intelligence';
    }
    
    // Default fallback
    return 'General';
}

async function fetchFeaturesFromReadme(repoPath) {
    try {
        const cleanPath = repoPath.replace('./', '');
        const readmeUrl = `https://raw.githubusercontent.com/CheckPointSW/mcp-servers/main/${cleanPath}/README.md`;
        
        console.log(`Fetching features from: ${readmeUrl}`);
        
        const response = await fetch(readmeUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch README: ${response.status}`);
        }
        
        const readmeText = await response.text();
        return parseFeaturesFromReadme(readmeText);
        
    } catch (error) {
        console.warn('Failed to fetch features from README:', error);
        return null;
    }
}

// Parse features from README markdown
function parseFeaturesFromReadme(readmeText) {
    try {
        // Find the Features section
        const featuresMatch = readmeText.match(/## Features\s*\n([\s\S]*?)(?=\n##|\n#|\z)/);
        if (!featuresMatch) {
            console.warn('No Features section found in README');
            return null;
        }
        
        const featuresSection = featuresMatch[1];
        
        // Extract bullet points
        const featureLines = featuresSection.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('-'))
            .map(line => line.substring(1).trim()); // Remove the '-' prefix
        
        // Clean up features: extract text before colon, remove markdown formatting
        const cleanedFeatures = featureLines.map(feature => {
            // Handle different formats:
            // - **Category**: Description -> Category
            // - Category: Description -> Category  
            // - Simple description -> Simple description
            
            let cleaned = feature;
            
            // Remove markdown formatting
            cleaned = cleaned.replace(/\*\*/g, ''); // Remove bold
            cleaned = cleaned.replace(/\*/g, '');   // Remove italic
            cleaned = cleaned.replace(/`/g, '');    // Remove code
            
            // Extract text before colon if exists
            const colonIndex = cleaned.indexOf(':');
            if (colonIndex > 0 && colonIndex < 50) { // Only if colon is reasonably early
                cleaned = cleaned.substring(0, colonIndex).trim();
            }
            
            // Clean up any remaining formatting
            cleaned = cleaned.replace(/^\s*-\s*/, ''); // Remove leading dashes
            cleaned = cleaned.trim();
            
            return cleaned;
        }).filter(feature => feature.length > 0 && feature.length < 80); // Filter out empty or too long
        
        console.log(`Parsed ${cleanedFeatures.length} features from README`);
        return cleanedFeatures;
        
    } catch (error) {
        console.error('Error parsing features from README:', error);
        return null;
    }
}

// DOM elements
let mobileMenuToggle;
let navMenu;
let serversGrid;

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    initializeComponents();
    setupEventListeners();
    setupScrollEffects();
    setupVideoHandler();
    
    // Load MCP servers dynamically and render
    await loadAndRenderMCPServers();
});

// Update the server count in the hero stats section
function updateServerCount(count) {
    const serverCountElement = document.getElementById('server-count');
    if (serverCountElement) {
        serverCountElement.textContent = count;
        console.log(`Updated server count to: ${count}`);
    }
}

// Load and render MCP servers
async function loadAndRenderMCPServers() {
    try {
        // Show loading state
        showLoadingState();
        
        // Load servers from README
        await loadMCPServersFromReadme();
        
        // Update the server count in the hero section
        updateServerCount(mcpServers.length);

        // Render the servers
        renderMCPServers();
        
        // Hide loading state
        hideLoadingState();
        
    } catch (error) {
        console.error('Failed to load MCP servers:', error);
        hideLoadingState();
        showErrorState();
    }
}

// Show loading state for servers grid
function showLoadingState() {
    if (!serversGrid) return;
    
    serversGrid.innerHTML = `
        <div class="servers-loading">
            <div class="loading-spinner"></div>
            <p>Loading MCP servers from repository...</p>
        </div>
    `;
}

// Hide loading state
function hideLoadingState() {
    const loadingElement = document.querySelector('.servers-loading');
    if (loadingElement) {
        loadingElement.remove();
    }
}

// Show error state
function showErrorState() {
    if (!serversGrid) return;
    
    serversGrid.innerHTML = `
        <div class="servers-error">
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Unable to Load Servers</h3>
            <p>We're having trouble loading the latest MCP servers. Please try refreshing the page.</p>
            <button class="btn btn-primary" onclick="window.location.reload()">
                <i class="fas fa-refresh"></i> Refresh Page
            </button>
        </div>
    `;
}

// Initialize DOM components
function initializeComponents() {
    mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    navMenu = document.querySelector('.nav-menu');
    serversGrid = document.querySelector('.servers-grid');
}

// Setup event listeners
function setupEventListeners() {
    // Mobile menu toggle
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    }

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = target.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Close mobile menu if open
                if (navMenu.classList.contains('active')) {
                    toggleMobileMenu();
                }
            }
        });
    });

    // Header scroll effect
    window.addEventListener('scroll', handleHeaderScroll);

    // Intersection Observer for animations
    if ('IntersectionObserver' in window) {
        setupIntersectionObserver();
    }
}

// Toggle mobile menu
function toggleMobileMenu() {
    mobileMenuToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
    document.body.classList.toggle('menu-open');
}

// Handle header scroll effects
function handleHeaderScroll() {
    // Header styling remains consistent - no background color changes
    // Optional: You can add other scroll effects here if needed
}

// Setup intersection observer for scroll animations
function setupIntersectionObserver() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe elements that should animate
    document.querySelectorAll('.overview-card, .server-card, .demo-features').forEach(el => {
        observer.observe(el);
    });
}

// Setup video handler
function setupVideoHandler() {
    const videoPlaceholder = document.querySelector('.video-placeholder');
    if (videoPlaceholder) {
        videoPlaceholder.addEventListener('click', function() {
            const videoId = this.dataset.videoId;
            if (videoId) {
                embedYouTubeVideo(this, videoId);
            }
        });
    }
}

// Embed YouTube video
function embedYouTubeVideo(container, videoId) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    iframe.frameBorder = '0';
    iframe.allowFullscreen = true;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';

    // Create a wrapper to maintain aspect ratio
    const videoWrapper = document.createElement('div');
    videoWrapper.style.position = 'relative';
    videoWrapper.style.width = '100%';
    videoWrapper.style.paddingBottom = '56.25%'; // 16:9 aspect ratio
    videoWrapper.style.height = '0';
    videoWrapper.style.overflow = 'hidden';
    
    videoWrapper.appendChild(iframe);
    
    // Clear the container and add the wrapper
    container.innerHTML = '';
    container.appendChild(videoWrapper);
    
    // Remove the cursor pointer and transition from the container
    container.style.cursor = 'default';
    container.style.transition = 'none';
}

// Render MCP servers grid
function renderMCPServers() {
    if (!serversGrid) return;

    serversGrid.innerHTML = mcpServers.map(server => createServerCard(server)).join('');
    
    // Setup server card interactions
    setupServerCardInteractions();
}

// Create server card HTML
function createServerCard(server) {
    return `
        <div class="server-card" data-category="${server.category}">
            <div class="server-header">
                <div class="server-icon">
                    <i class="${server.icon}"></i>
                </div>
                <div class="server-info">
                    <h3 class="server-name">${server.name}</h3>
                    <p class="server-package">${server.package}</p>
                </div>
            </div>
            
            <div class="server-description">
                <p>${server.description}</p>
            </div>
            
            <div class="server-actions">
                <a href="${server.publicRepo}" target="_blank" class="btn btn-outline">
                    <i class="fab fa-github"></i>
                    View Source
                </a>
                <a href="${server.mcpbDownload}" download class="btn btn-secondary">
                    <i class="fas fa-download"></i>
                    Download MCPB
                </a>
                <button class="btn btn-primary configure-btn" data-server="${server.name}">
                    <i class="fas fa-cog"></i>
                    Configure
                </button>
            </div>
            
            <div class="server-links">
                <a href="${server.npmPackage}" target="_blank" class="server-link">
                    <i class="fab fa-npm"></i>
                    NPM Package
                </a>
            </div>
        </div>
    `;
}

// Setup server card interactions
function setupServerCardInteractions() {
    // Configure buttons
    document.querySelectorAll('.configure-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const serverName = this.dataset.server;
            showConfigurationModal(serverName);
        });
    });

    // Card hover effects
    document.querySelectorAll('.server-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px)';
            this.style.boxShadow = 'var(--shadow-xl)';
        });

        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'var(--shadow-md)';
        });
    });
}

// Show configuration modal
function showConfigurationModal(serverName) {
    if (window.configManager) {
        window.configManager.showConfigurationModal(serverName);
    } else {
        console.error('Configuration manager not loaded');
        // Fallback to basic info
        const server = mcpServers.find(s => s.name === serverName);
        if (server) {
            alert(`Configuration for ${server.name} will be available shortly. Please visit ${server.publicRepo} for setup instructions.`);
        }
    }
}

// Setup scroll effects
function setupScrollEffects() {
    // Parallax effect for hero section
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelector('.hero-graphic');
        
        if (parallax) {
            const speed = scrolled * 0.5;
            parallax.style.transform = `translateY(${speed}px)`;
        }
    });

    // Update active navigation link
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');

    window.addEventListener('scroll', function() {
        let current = '';
        const scrollPosition = window.pageYOffset + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Add CSS for server cards and animations
function addDynamicStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Override grid layout for Safari compatibility */
        .servers-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) !important;
            gap: var(--spacing-xl) !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .server-card {
            background: var(--background-primary);
            border-radius: var(--radius-xl);
            padding: var(--spacing-xl);
            box-shadow: var(--shadow-md);
            transition: all var(--transition-base);
            border: 1px solid var(--border-light);
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 400px;
            overflow: hidden;
            /* Safari-specific fixes */
            -webkit-flex-direction: column;
            -webkit-box-orient: vertical;
            -webkit-box-direction: normal;
            flex-basis: auto;
            width: auto !important;
            min-width: 300px !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            margin: 0 !important;
        }

        .server-header {
            display: flex;
            align-items: flex-start;
            gap: var(--spacing-md);
            margin-bottom: var(--spacing-lg);
            position: relative;
            flex-shrink: 0;
            /* Safari-specific fixes */
            -webkit-flex-shrink: 0;
            -webkit-box-align: start;
        }

        .server-icon {
            width: 60px;
            height: 60px;
            background: var(--gradient-primary);
            border-radius: var(--radius-lg);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-size-xl);
            color: white;
            flex-shrink: 0;
        }

        .server-info {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            /* Safari-specific fixes */
            -webkit-flex: 1;
            -webkit-box-flex: 1;
            word-break: break-word;
            -webkit-hyphens: auto;
            hyphens: auto;
        }

        .server-name {
            font-size: var(--font-size-xl);
            font-weight: 600;
            margin-bottom: var(--spacing-xs);
            color: var(--text-primary);
            line-height: 1.2;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .server-package {
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: var(--font-size-sm);
            color: var(--brand-berry);
            background: rgba(238, 12, 93, 0.1);
            padding: var(--spacing-xs) var(--spacing-sm);
            border-radius: var(--radius-sm);
            display: inline-block;
            word-break: break-all;
            max-width: 100%;
        }

        .server-description {
            margin-bottom: var(--spacing-xl);
            color: var(--text-secondary);
            line-height: 1.6;
            flex-grow: 1;
            word-wrap: break-word;
            overflow-wrap: break-word;
            /* Safari-specific fixes */
            -webkit-flex-grow: 1;
            -webkit-box-flex: 1;
            -webkit-hyphens: auto;
            hyphens: auto;
            max-width: 100%;
        }

        .server-actions {
            display: flex;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-md);
            flex-wrap: wrap;
            flex-shrink: 0;
            /* Safari-specific fixes */
            -webkit-flex-shrink: 0;
            -webkit-flex-wrap: wrap;
            -webkit-box-pack: start;
            justify-content: flex-start;
        }

        .server-actions .btn {
            flex: 1;
            min-width: 160px;
            font-size: var(--font-size-sm);
            padding: var(--spacing-md) var(--spacing-xl);
        }

        .server-actions .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .server-actions .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.4);
        }

        .btn-outline {
            background: transparent;
            color: var(--brand-berry);
            border: 2px solid var(--brand-berry);
        }

        .btn-outline:hover {
            background: var(--brand-berry);
            color: white;
        }

        .server-links {
            padding-top: var(--spacing-md);
            border-top: 1px solid var(--border-light);
            flex-shrink: 0;
        }

        .server-link {
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-xs);
            color: var(--text-secondary);
            text-decoration: none;
            font-size: var(--font-size-sm);
            transition: color var(--transition-fast);
        }

        .server-link:hover {
            color: var(--brand-berry);
        }

        .animate-in {
            animation: slideInUp 0.6s ease-out;
        }

        @keyframes slideInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .nav-link.active {
            color: var(--brand-berry);
            font-weight: 600;
        }

        body.menu-open {
            overflow: hidden;
        }

        @media (max-width: 768px) {
            .server-actions {
                flex-direction: column;
            }

            .server-actions .btn {
                width: 100%;
            }
        }

        /* Safari-specific fixes */
        @supports (-webkit-appearance: none) {
            .servers-grid {
                display: grid !important;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
                gap: var(--spacing-xl) !important;
                /* Safari grid fallback */
                -webkit-grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
            }
            
            /* More specific Safari grid fix */
            @media screen and (-webkit-min-device-pixel-ratio: 0) {
                .servers-grid {
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)) !important;
                    justify-content: space-between !important;
                }
            }
            
            .server-card {
                display: -webkit-box;
                display: -webkit-flex;
                display: flex;
                -webkit-box-orient: vertical;
                -webkit-box-direction: normal;
                -webkit-flex-direction: column;
                flex-direction: column;
                width: auto !important;
                min-width: 300px !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                position: relative !important;
                margin: 0 !important;
                grid-column: auto !important;
                grid-row: auto !important;
            }
            
            .server-info {
                -webkit-box-flex: 1;
                -webkit-flex: 1 1 auto;
                flex: 1 1 auto;
            }
            
            .server-description {
                -webkit-box-flex: 1;
                -webkit-flex: 1 1 auto;
                flex: 1 1 auto;
            }
            
            .server-header,
            .server-actions,
            .server-links {
                -webkit-box-flex: 0;
                -webkit-flex: 0 0 auto;
                flex: 0 0 auto;
            }
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    addDynamicStyles();
});

