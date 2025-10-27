/**
 * Core parser    if (inlineLayerUids.size > 0 && apiManager) {
        
        for (const uid of inlineLayerUids) {
            try {
                const inlineData = await fetchRulebaseByUid(uid, apiManager);eck Point rulebase JSON
 */

import { ObjectResolver } from './object-resolver.js';
import { APIManagerForAPIKey } from '@chkp/quantum-infra';

/**
 * Helper function to fetch rulebase by UID using APIManager directly
 */
async function fetchRulebaseByUid(uid: string, apiManager: APIManagerForAPIKey): Promise<any> {
    try {
        const response = await apiManager.callApi('POST', 'show-access-rulebase', { uid });
        return response;
    } catch (error) {
        throw new Error(`Failed to fetch rulebase: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Helper function to fetch object by UID using APIManager directly
 */
async function fetchObjectByUid(uid: string, apiManager: APIManagerForAPIKey): Promise<any> {
    try {
        const response = await apiManager.callApi('POST', 'show-object', { 
            uid: uid,
            'details-level': 'full'
        });
        return response;
    } catch (error) {
        throw new Error(`Failed to fetch object: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Parse the show-access-rulebase JSON structure with inline layer support and group expansion
 */
export async function parseRulebaseWithInlineLayers(jsonData: any, apiManager?: APIManagerForAPIKey, expandGroups: boolean = false, groupMode: 'in-rule' | 'as-reference' = 'in-rule') {
    // First, collect all inline layer UIDs recursively
    const inlineLayerUids = collectInlineLayerUids(jsonData);
    
    // If we have inline layers and an API client, fetch them
    let mergedObjectsDictionary = jsonData['objects-dictionary'] || [];
    let inlineLayersData: { [uid: string]: any } = {};
    
    if (inlineLayerUids.size > 0 && apiManager) {
        
        for (const uid of inlineLayerUids) {
            try {
                const inlineData = await fetchRulebaseByUid(uid, apiManager);
                inlineLayersData[uid] = inlineData;
                
                // Merge objects dictionary
                if (inlineData['objects-dictionary']) {
                    mergedObjectsDictionary = [...mergedObjectsDictionary, ...inlineData['objects-dictionary']];
                }
                
                // Recursively collect UIDs from nested inline layers
                const nestedUids = collectInlineLayerUids(inlineData);
                for (const nestedUid of nestedUids) {
                    if (!inlineLayerUids.has(nestedUid)) {
                        inlineLayerUids.add(nestedUid);
                    }
                }
            } catch (error) {
                console.warn(`Failed to fetch inline layer ${uid}:`, error);
            }
        }
    }
    
    // Handle group expansion if requested
    let groupsData: { [uid: string]: any } = {};
    if (expandGroups && apiManager) {
        const groupUids = collectGroupUids(jsonData, mergedObjectsDictionary);
        if (groupUids.size > 0) {
            groupsData = await fetchGroupsRecursively(groupUids, apiManager);
        }
    }
    
    // Initialize object resolver with merged dictionary
    const resolver = new ObjectResolver(mergedObjectsDictionary);
    
    // Parse the main rulebase
    const result = {
        name: jsonData.name || 'Unknown Policy',
        uid: jsonData.uid,
        sections: [] as any[],
        groupsData: groupsData, // Store groups data for reference mode
        groupMode: groupMode
    };
    
    // Process each section in the rulebase
    if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
        jsonData.rulebase.forEach((item: any) => {
            if (item.type === 'access-section') {
                result.sections.push(parseSection(item, resolver, inlineLayersData, groupsData, groupMode));
            } else if (item.type === 'access-rule') {
                // Handle standalone rules (not in sections)
                if (result.sections.length === 0) {
                    result.sections.push({
                        name: 'Rules',
                        type: 'access-section',
                        from: 1,
                        to: 999,
                        rules: []
                    });
                }
                result.sections[result.sections.length - 1].rules.push(parseRule(item, resolver, inlineLayersData, groupsData, groupMode));
            }
        });
    }
    
    return result;
}

/**
 * Legacy parser function (backwards compatibility)
 */
export function parseRulebase(jsonData: any) {
    // Initialize object resolver
    const resolver = new ObjectResolver(jsonData['objects-dictionary'] || []);
    
    // Parse the main rulebase
    const result = {
        name: jsonData.name || 'Unknown Policy',
        uid: jsonData.uid,
        sections: [] as any[]
    };
    
    // Process each section in the rulebase
    if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
        jsonData.rulebase.forEach((item: any) => {
            if (item.type === 'access-section') {
                result.sections.push(parseSection(item, resolver));
            } else if (item.type === 'access-rule') {
                // Handle standalone rules (not in sections)
                if (result.sections.length === 0) {
                    result.sections.push({
                        name: 'Rules',
                        type: 'access-section',
                        from: 1,
                        to: 999,
                        rules: []
                    });
                }
                result.sections[result.sections.length - 1].rules.push(parseRule(item, resolver));
            }
        });
    }
    
    return result;
}

/**
 * Collect all inline layer UIDs from a rulebase recursively
 */
function collectInlineLayerUids(jsonData: any): Set<string> {
    const uids = new Set<string>();
    
    function collectFromRulebase(rulebase: any[]) {
        rulebase.forEach((item: any) => {
            if (item.type === 'access-section' && item.rulebase) {
                collectFromRulebase(item.rulebase);
            } else if (item.type === 'access-rule' && item['inline-layer']) {
                const inlineLayer = item['inline-layer'];
                if (typeof inlineLayer === 'string') {
                    uids.add(inlineLayer);
                } else if (inlineLayer.uid) {
                    uids.add(inlineLayer.uid);
                }
            }
        });
    }
    
    if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
        collectFromRulebase(jsonData.rulebase);
    }
    
    return uids;
}

/**
 * Collect all group UIDs from a rulebase and objects dictionary
 */
function collectGroupUids(jsonData: any, objectsDictionary: any[]): Set<string> {
    const uids = new Set<string>();
    
    // Check objects dictionary for groups
    objectsDictionary.forEach((obj: any) => {
        if (obj.type === 'group') {
            uids.add(obj.uid);
        }
    });
    
    // Also scan the rulebase for group references
    function scanRulebaseForGroups(rulebase: any[]) {
        rulebase.forEach((item: any) => {
            if (item.type === 'access-section' && item.rulebase) {
                scanRulebaseForGroups(item.rulebase);
            } else if (item.type === 'access-rule') {
                // Check source, destination, service fields for group references
                const fields = [item.source, item.destination, item.service, item.time];
                fields.forEach((field: any) => {
                    if (Array.isArray(field)) {
                        field.forEach((ref: any) => {
                            if (typeof ref === 'string') {
                                // Find in objects dictionary to check if it's a group
                                const obj = objectsDictionary.find((o: any) => o.uid === ref);
                                if (obj && obj.type === 'group') {
                                    uids.add(ref);
                                }
                            } else if (ref && ref.uid && ref.type === 'group') {
                                uids.add(ref.uid);
                            }
                        });
                    }
                });
            }
        });
    }
    
    if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
        scanRulebaseForGroups(jsonData.rulebase);
    }
    
    return uids;
}

/**
 * Fetch group details recursively (groups within groups)
 */
async function fetchGroupsRecursively(groupUids: Set<string>, apiManager: APIManagerForAPIKey): Promise<{ [uid: string]: any }> {
    const groupsData: { [uid: string]: any } = {};
    const processedUids = new Set<string>();
    
    async function processGroup(uid: string) {
        if (processedUids.has(uid)) return;
        processedUids.add(uid);
        
        try {
            const groupData = await fetchObjectByUid(uid, apiManager);
            if (groupData && groupData.object) {
                groupsData[uid] = groupData.object;
                
                // Check for nested groups in members
                if (groupData.object.members && Array.isArray(groupData.object.members)) {
                    for (const member of groupData.object.members) {
                        if (member.type === 'group' && !processedUids.has(member.uid)) {
                            await processGroup(member.uid);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to fetch group ${uid}:`, error);
        }
    }
    
    for (const uid of groupUids) {
        await processGroup(uid);
    }
    
    return groupsData;
}

/**
 * Resolve objects with group expansion based on mode
 */
function resolveWithGroups(objects: any[], groupsData: { [uid: string]: any }, groupMode: 'in-rule' | 'as-reference'): any[] {
    if (groupMode === 'as-reference') {
        // In reference mode, keep groups as-is
        return objects;
    }
    
    // In in-rule mode, expand groups
    const expandedObjects: any[] = [];
    
    objects.forEach((obj: any) => {
        if (obj.type === 'group' && groupsData[obj.uid]) {
            const groupData = groupsData[obj.uid];
            if (groupData.members && Array.isArray(groupData.members)) {
                // Recursively expand group members
                const expandedMembers = expandGroupMembers(groupData.members, groupsData);
                expandedObjects.push(...expandedMembers);
            }
        } else {
            expandedObjects.push(obj);
        }
    });
    
    return expandedObjects;
}

/**
 * Recursively expand group members
 */
function expandGroupMembers(members: any[], groupsData: { [uid: string]: any }): any[] {
    const expanded: any[] = [];
    
    members.forEach((member: any) => {
        if (member.type === 'group' && groupsData[member.uid]) {
            const nestedGroupData = groupsData[member.uid];
            if (nestedGroupData.members && Array.isArray(nestedGroupData.members)) {
                expanded.push(...expandGroupMembers(nestedGroupData.members, groupsData));
            }
        } else {
            expanded.push(member);
        }
    });
    
    return expanded;
}

/**
 * Parse a section containing multiple rules
 */
function parseSection(sectionData: any, resolver: ObjectResolver, inlineLayersData: { [uid: string]: any } = {}, groupsData: { [uid: string]: any } = {}, groupMode: 'in-rule' | 'as-reference' = 'in-rule') {
    const section = {
        name: sectionData.name || 'Unnamed Section',
        uid: sectionData.uid,
        type: sectionData.type,
        from: sectionData.from,
        to: sectionData.to,
        rules: [] as any[]
    };
    
    // Parse rules within the section
    if (sectionData.rulebase && Array.isArray(sectionData.rulebase)) {
        sectionData.rulebase.forEach((rule: any) => {
            if (rule.type === 'access-rule') {
                section.rules.push(parseRule(rule, resolver, inlineLayersData, groupsData, groupMode));
            }
        });
    }
    
    return section;
}

/**
 * Parse an individual access rule
 */
function parseRule(ruleData: any, resolver: ObjectResolver, inlineLayersData: { [uid: string]: any } = {}, groupsData: { [uid: string]: any } = {}, groupMode: 'in-rule' | 'as-reference' = 'in-rule') {
    const rule = {
        uid: ruleData.uid,
        name: ruleData.name || 'Unnamed Rule',
        ruleNumber: ruleData['rule-number'],
        parentRuleNumber: null as number | null, // For inline layer rules
        enabled: ruleData.enabled !== false,
        
        // Resolve sources with group expansion
        sources: resolveWithGroups(resolver.resolveMultiple(ruleData.source || []), groupsData, groupMode),
        sourceNegate: ruleData['source-negate'] || false,
        
        // Resolve destinations with group expansion
        destinations: resolveWithGroups(resolver.resolveMultiple(ruleData.destination || []), groupsData, groupMode),
        destinationNegate: ruleData['destination-negate'] || false,
        
        // Resolve services with group expansion
        services: resolveWithGroups(resolver.resolveMultiple(ruleData.service || []), groupsData, groupMode),
        serviceNegate: ruleData['service-negate'] || false,
        
        // Resolve action
        action: resolver.resolve(ruleData.action),
        
        // Additional fields
        track: ruleData.track,
        time: resolver.resolveMultiple(ruleData.time || []),
        content: resolver.resolveMultiple(ruleData.content || []),
        vpn: resolver.resolveMultiple(ruleData.vpn || []),
        comments: ruleData.comments || '',
        
        // Inline layer handling
        inlineLayer: ruleData['inline-layer'] ? resolver.resolve(ruleData['inline-layer']) : null,
        inlineRules: [] as any[], // Will contain nested rules if this rule has an inline layer
        
        // Meta information
        metaInfo: ruleData['meta-info'] || {},
        installOn: resolver.resolveMultiple(ruleData['install-on'] || [])
    };
    
    // If this rule has an inline layer, parse its rules
    if (rule.inlineLayer && rule.inlineLayer.uid && inlineLayersData[rule.inlineLayer.uid]) {
        const inlineData = inlineLayersData[rule.inlineLayer.uid];
        rule.inlineRules = parseInlineLayerRules(inlineData, resolver, rule.ruleNumber, groupsData, groupMode);
    }
    
    return rule;
}

/**
 * Parse rules from an inline layer
 */
function parseInlineLayerRules(inlineData: any, resolver: ObjectResolver, parentRuleNumber: number, groupsData: { [uid: string]: any } = {}, groupMode: 'in-rule' | 'as-reference' = 'in-rule'): any[] {
    const inlineRules: any[] = [];
    let subruleIndex = 1;
    
    if (inlineData.rulebase && Array.isArray(inlineData.rulebase)) {
        inlineData.rulebase.forEach((item: any) => {
            if (item.type === 'access-section' && item.rulebase) {
                // Process rules within the section
                item.rulebase.forEach((rule: any) => {
                    if (rule.type === 'access-rule') {
                        const parsedRule = parseRule(rule, resolver, {}, groupsData, groupMode);
                        // Set the subrule number (e.g., 12.1, 12.2)
                        parsedRule.ruleNumber = `${parentRuleNumber}.${subruleIndex}`;
                        parsedRule.parentRuleNumber = parentRuleNumber;
                        inlineRules.push(parsedRule);
                        subruleIndex++;
                    }
                });
            } else if (item.type === 'access-rule') {
                // Direct rule in inline layer
                const parsedRule = parseRule(item, resolver, {}, groupsData, groupMode);
                parsedRule.ruleNumber = `${parentRuleNumber}.${subruleIndex}`;
                parsedRule.parentRuleNumber = parentRuleNumber;
                inlineRules.push(parsedRule);
                subruleIndex++;
            }
        });
    }
    
    return inlineRules;
}

/**
 * Get statistics about the parsed rulebase
 */
export function getRulebaseStats(parsedData: any) {
    let totalRules = 0;
    let enabledRules = 0;
    let disabledRules = 0;
    
    parsedData.sections.forEach((section: any) => {
        section.rules.forEach((rule: any) => {
            totalRules++;
            if (rule.enabled) {
                enabledRules++;
            } else {
                disabledRules++;
            }
        });
    });
    
    return {
        totalSections: parsedData.sections.length,
        totalRules,
        enabledRules,
        disabledRules
    };
}
