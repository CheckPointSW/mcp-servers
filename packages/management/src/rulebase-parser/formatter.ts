/**
 * Table formatter for parsed rulebase data
 */

/**
 * Format the parsed rulebase as a readable table
 */
export function formatAsTable(parsedData: any): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`Check Point Rulebase: ${parsedData.name}`);
    lines.push('='.repeat(120));
    lines.push('');
    
    // Process each section
    parsedData.sections.forEach((section: any, sectionIndex: number) => {
        if (sectionIndex > 0) {
            lines.push('');
        }
        
        // Section header
        lines.push('='.repeat(80));
        lines.push(`SECTION: ${section.name} (Rules ${section.from}-${section.to})`);
        lines.push('='.repeat(80));
        lines.push('');
        
        // Section info
        if (section.uid) {
            lines.push(`Layer UID: ${section.uid}`);
        }
        if (section.domain) {
            lines.push(`Domain: ${section.domain.name || section.domain}`);
        }
        lines.push('');
        
        // Table header
        lines.push('Rule#'.padEnd(6) + 
                   'Name'.padEnd(25) + 
                   'Source'.padEnd(30) + 
                   'Destination'.padEnd(30) + 
                   'Service'.padEnd(25) + 
                   'Action'.padEnd(10) + 
                   'Status');
        lines.push('-'.repeat(126));
        
        // Process each rule
        if (section.rules && section.rules.length > 0) {
            section.rules.forEach((rule: any, ruleIndex: number) => {
                const ruleLines = formatRule(rule);
                lines.push(...ruleLines);
                
                // If this rule has inline rules, display them
                if (rule.inlineRules && rule.inlineRules.length > 0) {
                    rule.inlineRules.forEach((inlineRule: any) => {
                        const inlineRuleLines = formatRule(inlineRule, true); // true indicates this is an inline rule
                        lines.push(...inlineRuleLines);
                    });
                }
                
                // Add rule separator for better readability
                if (ruleIndex < section.rules.length - 1) {
                    lines.push('');
                }
            });
        } else {
            lines.push('No rules in this section');
        }
    });
    
    // Add group reference table if in as-reference mode
    if (parsedData.groupMode === 'as-reference' && parsedData.groupsData && Object.keys(parsedData.groupsData).length > 0) {
        lines.push('');
        lines.push('='.repeat(120));
        lines.push('GROUP REFERENCE TABLE');
        lines.push('='.repeat(120));
        lines.push('');
        
        Object.values(parsedData.groupsData).forEach((group: any) => {
            lines.push(`GROUP: ${group.name} (${group.uid})`);
            lines.push('-'.repeat(80));
            
            if (group.members && group.members.length > 0) {
                group.members.forEach((member: any) => {
                    const memberInfo = formatObjectForModel(member);
                    lines.push(`  • ${memberInfo}`);
                });
            } else {
                lines.push('  No members');
            }
            lines.push('');
        });
    }
    
    return lines.join('\n');
}

/**
 * Format a single rule's data
 */
function formatRule(rule: any, isInlineRule: boolean = false): string[] {
    const lines: string[] = [];
    
    // Main rule line with indentation for inline rules
    const indent = isInlineRule ? '  ' : '';
    const mainLine = indent +
        (rule.ruleNumber || '-').toString().padEnd(6) +
        ((rule.name || '-').toString()).substring(0, 24).padEnd(25) +
        formatObjectNoTruncation(rule.sources, 29).padEnd(30) +
        formatObjectNoTruncation(rule.destinations, 29).padEnd(30) +
        formatObjectNoTruncation(rule.services, 24).padEnd(25) +
        ((rule.action?.name || rule.action || '-').toString()).substring(0, 9).padEnd(10) +
        (rule.enabled === false ? 'DISABLED' : 'ENABLED');
    
    lines.push(mainLine);
    
    // Add additional information about the rule
    const additionalInfo = getAdditionalInfo(rule);
    if (additionalInfo.length > 0) {
        additionalInfo.forEach((info: string) => {
            lines.push(indent + '      → ' + info);
        });
    }
    
    return lines;
}

/**
 * Format objects with full detail, no truncation
 */
function formatObjectNoTruncation(obj: any, maxWidth: number): string {
    if (!obj) return '-';
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) return 'Any';
        
        // Special handling for single "Any" object
        if (obj.length === 1 && obj[0].name === 'Any') {
            return 'Any';
        }
        
        const items = obj.map((item: any) => {
            if (!item || !item.name) return 'Unknown';
            
            let display = item.name;
            
            // Add type information if available
            if (item.type && item.type !== 'group') {
                const shortType = getShortType(item.type);
                if (shortType !== item.name) {
                    display += ` (${shortType})`;
                }
            }
            
            // Add IP/port information for services
            if (item.port) {
                display += `:${item.port}`;
            }
            
            return display;
        });
        
        // Join items with proper separation, don't truncate
        const result = items.join(', ');
        
        // If it's longer than maxWidth, format nicely but don't cut off
        if (result.length > maxWidth) {
            return result; // Return full text - no truncation for model consumption
        }
        
        return result;
    }
    
    // Single object
    if (obj.name) {
        let display = obj.name;
        if (obj.type && obj.type !== 'group') {
            const shortType = getShortType(obj.type);
            if (shortType !== obj.name) {
                display += ` (${shortType})`;
            }
        }
        if (obj.port) {
            display += `:${obj.port}`;
        }
        return display;
    }
    
    return obj.toString();
}

/**
 * Format objects (with truncation for narrow displays)
 */
function formatObject(obj: any, width: number): string {
    if (!obj) return '-';
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) return 'Any';
        
        // Special handling for single "Any" object
        if (obj.length === 1 && obj[0].name === 'Any') {
            return 'Any';
        }
        
        const items = obj.map((item: any) => {
            if (!item || !item.name) return 'Unknown';
            
            let display = item.name;
            
            // Add type information if available
            if (item.type && item.type !== 'group') {
                const shortType = getShortType(item.type);
                if (shortType !== item.name) {
                    display += ` (${shortType})`;
                }
            }
            
            // Add IP/port information for services
            if (item.port) {
                display += `:${item.port}`;
            }
            
            return display;
        });
        
        const result = items.join(', ');
        return truncateText(result, width);
    }
    
    // Single object
    if (obj.name) {
        let display = obj.name;
        if (obj.type && obj.type !== 'group') {
            const shortType = getShortType(obj.type);
            if (shortType !== obj.name) {
                display += ` (${shortType})`;
            }
        }
        if (obj.port) {
            display += `:${obj.port}`;
        }
        return truncateText(display, width);
    }
    
    return truncateText(obj.toString(), width);
}

/**
 * Get short type names for display
 */
function getShortType(type: string): string {
    const shortTypes: { [key: string]: string } = {
        'service-tcp': 'TCP',
        'service-udp': 'UDP',
        'service-icmp': 'ICMP',
        'service-group': 'Svc Grp',
        'access-role': 'Role',
        'application-site': 'App Site',
        'simple-gateway': 'Gateway',
        'security-zone': 'Zone',
        'access-layer': 'Layer',
        'CpmiHostCkp': 'Host',
        'CpmiGatewayCluster': 'Cluster',
        'service-other': 'Other',
        'network': 'Network'
    };
    
    return shortTypes[type] || type;
}

/**
 * Get additional information about a rule
 */
function getAdditionalInfo(rule: any): string[] {
    const info: string[] = [];
    
    // Show negation flags
    if (rule.sourceNegate) info.push('Source: NEGATED');
    if (rule.destinationNegate) info.push('Destination: NEGATED');
    if (rule.serviceNegate) info.push('Service: NEGATED');
    
    // Show inline layer
    if (rule.inlineLayer) {
        info.push(`Inline Layer: ${rule.inlineLayer.name}`);
    }
    
    // Show if rule is disabled
    if (!rule.enabled) {
        info.push('STATUS: DISABLED');
    }
    
    // Show comments if present
    if (rule.comments && rule.comments.trim()) {
        info.push(`Comment: ${rule.comments.trim()}`);
    }
    
    return info;
}

/**
 * Truncate text to fit width
 */
function truncateText(text: string, width: number): string {
    if (text.length <= width) return text;
    
    if (width <= 3) return text.substring(0, width);
    
    return text.substring(0, width - 3) + '...';
}

/**
 * Format the parsed rulebase as a simple list
 */
export function formatAsList(parsedData: any): string {
    const lines: string[] = [];
    
    lines.push(`Rulebase: ${parsedData.name}`);
    lines.push('');
    
    parsedData.sections.forEach((section: any) => {
        lines.push(`Section: ${section.name}`);
        
        section.rules.forEach((rule: any) => {
            lines.push(`  Rule ${rule.ruleNumber}: ${rule.name || 'Unnamed'}`);
            lines.push(`     Source: ${rule.sources.map((s: any) => s.name).join(', ')}`);
            lines.push(`     Destination: ${rule.destinations.map((d: any) => d.name).join(', ')}`);
            lines.push(`     Service: ${rule.services.map((s: any) => s.name).join(', ')}`);
            lines.push(`     Action: ${rule.action?.name || rule.action}`);
            lines.push(`     Track: ${rule.track?.name || rule.track}`);
            lines.push(`     Enabled: ${rule.enabled !== false}`);
            lines.push('');
        });
    });
    
    return lines.join('\n');
}

/**
 * Format as model-friendly output with no truncation and full details
 */
export function formatAsModelFriendly(parsedData: any): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`Check Point Rulebase: ${parsedData.name}`);
    lines.push('='.repeat(120));
    lines.push('');
    
    // Process each section
    parsedData.sections.forEach((section: any, sectionIndex: number) => {
        if (sectionIndex > 0) {
            lines.push('');
            lines.push('─'.repeat(120));
            lines.push('');
        }
        
        // Section header
        lines.push(`SECTION ${sectionIndex + 1}: ${section.name}`);
        lines.push(`Rules ${section.from}-${section.to}`);
        if (section.uid) lines.push(`Layer UID: ${section.uid}`);
        if (section.domain) lines.push(`Domain: ${section.domain.name || section.domain}`);
        lines.push('');
        
        // Process each rule
        if (section.rules && section.rules.length > 0) {
            section.rules.forEach((rule: any, ruleIndex: number) => {
                const actualRuleNumber = rule.ruleNumber || (section.from + ruleIndex);
                lines.push(`RULE ${actualRuleNumber}: ${rule.name || 'Unnamed Rule'}`);
                lines.push(`  Status: ${rule.enabled === false ? 'DISABLED' : 'ENABLED'}`);
                lines.push('  Sources:');
                rule.sources.forEach((source: any) => {
                    lines.push(`    - ${formatObjectForModel(source)}`);
                });
                if (rule.sourceNegate) lines.push(`    [SOURCE NEGATED]`);
                
                lines.push('  Destinations:');
                rule.destinations.forEach((dest: any) => {
                    lines.push(`    - ${formatObjectForModel(dest)}`);
                });
                if (rule.destinationNegate) lines.push(`    [DESTINATION NEGATED]`);
                
                lines.push('  Services:');
                rule.services.forEach((service: any) => {
                    lines.push(`    - ${formatObjectForModel(service)}`);
                });
                if (rule.serviceNegate) lines.push(`    [SERVICE NEGATED]`);
                
                lines.push(`  Action: ${rule.action?.name || rule.action || 'Unknown'}`);
                lines.push(`  Track: ${rule.track?.name || rule.track || 'Unknown'}`);
                
                if (rule.time && rule.time.length > 0) {
                    lines.push('  Time Restrictions:');
                    rule.time.forEach((timeObj: any) => {
                        lines.push(`    - ${formatObjectForModel(timeObj)}`);
                    });
                }
                
                if (rule.inlineLayer) {
                    lines.push(`  Inline Layer: ${rule.inlineLayer.name}`);
                }
                
                if (rule.comments && rule.comments.trim()) {
                    lines.push(`  Comments: ${rule.comments.trim()}`);
                }
                
                // Display inline rules if present
                if (rule.inlineRules && rule.inlineRules.length > 0) {
                    lines.push('');
                    lines.push(`  INLINE LAYER RULES (${rule.inlineLayer?.name || 'Unknown Layer'}):`);
                    rule.inlineRules.forEach((inlineRule: any, inlineIndex: number) => {
                        lines.push(`    RULE ${inlineRule.ruleNumber}: ${inlineRule.name || 'Unnamed Rule'}`);
                        lines.push(`      Status: ${inlineRule.enabled === false ? 'DISABLED' : 'ENABLED'}`);
                        lines.push('      Sources:');
                        inlineRule.sources.forEach((source: any) => {
                            lines.push(`        - ${formatObjectForModel(source)}`);
                        });
                        lines.push('      Destinations:');
                        inlineRule.destinations.forEach((dest: any) => {
                            lines.push(`        - ${formatObjectForModel(dest)}`);
                        });
                        lines.push('      Services:');
                        inlineRule.services.forEach((service: any) => {
                            lines.push(`        - ${formatObjectForModel(service)}`);
                        });
                        lines.push(`      Action: ${inlineRule.action?.name || inlineRule.action || 'Unknown'}`);
                        
                        if (inlineRule.comments && inlineRule.comments.trim()) {
                            lines.push(`      Comments: ${inlineRule.comments.trim()}`);
                        }
                        
                        if (inlineIndex < rule.inlineRules.length - 1) {
                            lines.push('');
                        }
                    });
                }
                
                if (ruleIndex < section.rules.length - 1) {
                    lines.push('');
                }
            });
        } else {
            lines.push('  No rules in this section');
        }
    });
    
    // Add group reference table if in as-reference mode
    if (parsedData.groupMode === 'as-reference' && parsedData.groupsData && Object.keys(parsedData.groupsData).length > 0) {
        lines.push('');
        lines.push('─'.repeat(120));
        lines.push('');
        lines.push('GROUP REFERENCE TABLE');
        lines.push('═'.repeat(120));
        lines.push('');
        
        Object.values(parsedData.groupsData).forEach((group: any) => {
            lines.push(`GROUP: ${group.name}`);
            lines.push(`UID: ${group.uid}`);
            if (group.type) lines.push(`Type: ${group.type}`);
            if (group.comments) lines.push(`Comments: ${group.comments}`);
            lines.push('');
            lines.push('MEMBERS:');
            
            if (group.members && group.members.length > 0) {
                group.members.forEach((member: any) => {
                    lines.push(`  - ${formatObjectForModel(member)}`);
                });
            } else {
                lines.push('  No members');
            }
            
            lines.push('');
        });
    }
    
    return lines.join('\n');
}

/**
 * Format object for model-friendly output
 */
function formatObjectForModel(obj: any): string {
    if (!obj || !obj.name) return 'Unknown Object';
    
    const details: string[] = [obj.name];
    
    // Add type information
    if (obj.type && obj.type !== 'group') {
        details.push(`type: ${obj.type}`);
    }
    
    // Add IP information
    if (obj.ipv4Address) {
        details.push(`ip: ${obj.ipv4Address}`);
    }
    
    // Add port information for services
    if (obj.port) {
        details.push(`port: ${obj.port}`);
    }
    
    // Add protocol information
    if (obj.protocol) {
        details.push(`protocol: ${obj.protocol}`);
    }
    
    // Add subnet mask for networks
    if (obj.subnetMask) {
        details.push(`mask: ${obj.subnetMask}`);
    }
    
    // Add specific parameters based on type
    if (obj.params && obj.params !== obj.type && obj.params !== 'group') {
        details.push(`details: ${obj.params}`);
    }
    
    return details.join(' | ');
}
