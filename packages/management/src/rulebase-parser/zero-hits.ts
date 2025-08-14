/**
 * Zero Hits Utility Module
 * Provides functionality to find rules with zero hits across rulebases and policy packages
 */

// Type definitions
interface HitsSettings {
    target?: string;
    'from-date'?: string;
    'to-date'?: string;
}

interface ZeroHitRule {
    uid: string;
    name: string;
    rule_number?: number;
    inline_layers?: ZeroHitRulebaseResult[];
}

interface ZeroHitRulebaseResult {
    uid?: string;
    name?: string;
    rules: ZeroHitRule[];
}

interface PolicyResult {
    policy: string;
    status: 'installed' | 'not installed';
    layers?: ZeroHitRulebaseResult[];
}

interface ApiCallResult {
    api_name: string;
    arguments: Record<string, any>;
    response: any;
}

interface ApiCallFunction {
    name: string;
    arguments: Record<string, any>;
}

// Utility function to check if a string is a UUID
function isUuid(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

export class ZeroHitsUtil {
    private apiCall: (functionCall: ApiCallFunction) => Promise<[number, any]>;
    private success: boolean = true;
    private gateway?: string;
    private fromDate?: string;
    private toDate?: string;

    constructor(
        apiCall: (functionCall: ApiCallFunction) => Promise<[number, any]>,
        gateway?: string,
        fromDate?: string,
        toDate?: string
    ) {
        this.apiCall = apiCall;
        this.gateway = gateway;
        this.fromDate = fromDate;
        this.toDate = toDate;
    }

    /**
     * Get zero hits rules for a specific rulebase
     */
    async getZeroHitsRules(ruleBase: string): Promise<ZeroHitRulebaseResult[]> {
        let offset = 0;
        const limit = 100;
        const result: ZeroHitRulebaseResult = { rules: [] };
        const hitsSettings: HitsSettings = {};

        if (this.gateway) {
            hitsSettings.target = this.gateway;
        }
        if (this.fromDate) {
            hitsSettings['from-date'] = this.fromDate;
        }
        if (this.toDate) {
            hitsSettings['to-date'] = this.toDate;
        }

        while (true) {
            const showAccessRulebase: ApiCallFunction = isUuid(ruleBase)
                ? {
                    name: 'show-access-rulebase',
                    arguments: {
                        uid: ruleBase,
                        'show-hits': true,
                        'hits-settings': hitsSettings,
                        offset: offset,
                        limit: limit,
                    },
                }
                : {
                    name: 'show-access-rulebase',
                    arguments: {
                        name: ruleBase,
                        'show-hits': true,
                        'hits-settings': hitsSettings,
                        offset: offset,
                        limit: limit,
                    },
                };

            const response = await this.callFunction(showAccessRulebase);
            if (!this.success) {
                return [result];
            }
            if (response.api_name !== 'show-access-rulebase') {
                return [result];
            }
            if (!response.response) {
                return [result];
            }

            let responseData = response.response;
            if (Array.isArray(responseData) && responseData.length === 2) {
                responseData = responseData[1];
            }

            if (!responseData.rulebase) {
                return [result];
            }

            const rulebase = responseData.rulebase;
            const zeroHitsRules: ZeroHitRule[] = [];
            await this.getRulesFromResponse(rulebase, zeroHitsRules);
            
            result.uid = responseData.uid;
            result.name = responseData.name;
            result.rules.push(...zeroHitsRules);

            if (!responseData.total || !responseData.to) {
                return [result];
            }

            offset += limit;
            if (offset >= responseData.total) {
                return [result];
            }
        }
    }

    /**
     * Recursively extract rules with zero hits from response
     */
    private async getRulesFromResponse(rulebase: any[], zeroHitsRules: ZeroHitRule[]): Promise<void> {
        for (const rule of rulebase) {
            if (rule.type === 'access-section') {
                await this.getRulesFromResponse(rule.rulebase || [], zeroHitsRules);
            } else {
                const hitsValue = rule.hits?.value;
                if (hitsValue === 0) {
                    if (rule.uid && rule.name) {
                        zeroHitsRules.push({
                            uid: rule.uid,
                            name: rule.name,
                            rule_number: rule['rule-number'],
                        });
                    }
                } else {
                    if (rule['inline-layer']) {
                        const inlineLayers = await this.getZeroHitsRules(rule['inline-layer']);
                        zeroHitsRules.push({
                            uid: rule.uid,
                            name: rule.name,
                            rule_number: rule['rule-number'],
                            inline_layers: inlineLayers,
                        });
                    }
                }
            }
        }
    }

    /**
     * Get rules from access layers within a package
     */
    private async getRulesFromAccessLayer(
        responses: ZeroHitRulebaseResult[],
        packageData: any,
        layers: Set<string>
    ): Promise<void> {
        if (packageData['access-layers']) {
            for (const accessLayer of packageData['access-layers']) {
                if (!accessLayer.name || !accessLayer.uid) {
                    continue;
                }
                if (layers.has(accessLayer.uid)) {
                    continue;
                }
                const showAccessRulebaseResponse = await this.getZeroHitsRules(accessLayer.name);
                layers.add(accessLayer.uid);
                responses.push(...showAccessRulebaseResponse);
            }
        }
    }

    /**
     * Get zero hits rules from policy packages
     */
    async getRulesFromPackages(policyPackage?: string): Promise<PolicyResult[]> {
        const responses: PolicyResult[] = [];
        const layers = new Set<string>();
        const installedPolicies = await this.getInstalledPackages();

        if (policyPackage) {
            if (!installedPolicies.has(policyPackage)) {
                return [{ policy: policyPackage, status: 'not installed' }];
            }

            const showPackage: ApiCallFunction = {
                name: 'show-package',
                arguments: {
                    name: policyPackage,
                },
            };

            const response = await this.callFunction(showPackage);
            if (
                this.success &&
                response.api_name === 'show-package' &&
                response.response
            ) {
                const packageData = response.response;
                const layersResponse: ZeroHitRulebaseResult[] = [];
                await this.getRulesFromAccessLayer(layersResponse, packageData, layers);
                responses.push({
                    policy: policyPackage,
                    status: 'installed',
                    layers: layersResponse,
                });
            }
        } else {
            const showPackages: ApiCallFunction = {
                name: 'show-packages',
                arguments: {
                    'details-level': 'full',
                },
            };

            const response = await this.callFunction(showPackages);
            if (this.success && response.api_name === 'show-packages') {
                let responseData = response.response;
                if (Array.isArray(responseData) && responseData.length === 2) {
                    responseData = responseData[1];
                }

                if (responseData.packages) {
                    const packages = responseData.packages;
                    for (const packageData of packages) {
                        const policyResponse: PolicyResult = {
                            policy: packageData.name || 'Unknown',
                            status: 'not installed',
                        };

                        if (!installedPolicies.has(packageData.name)) {
                            policyResponse.status = 'not installed';
                            responses.push(policyResponse);
                            continue;
                        }

                        const layersResponse: ZeroHitRulebaseResult[] = [];
                        await this.getRulesFromAccessLayer(layersResponse, packageData, layers);
                        policyResponse.status = 'installed';
                        policyResponse.layers = layersResponse;
                        responses.push(policyResponse);
                    }
                }
            }
        }

        return responses;
    }

    /**
     * Get installed policy packages from gateways
     */
    private async getInstalledPackages(): Promise<Set<string>> {
        const installedPolicies = new Set<string>();
        const showGateways: ApiCallFunction = {
            name: 'show-gateways-and-servers',
            arguments: {
                'details-level': 'full',
            },
        };

        const response = await this.callFunction(showGateways);
        if (this.success && response.api_name === 'show-gateways-and-servers') {
            const gwObjects = response.response?.objects || [];
            const filteredGwObjects = gwObjects.filter((gw: any) => gw.type !== 'checkpoint-host');
            
            for (const gwObj of filteredGwObjects) {
                if (
                    gwObj.policy &&
                    gwObj.policy['access-policy-installed'] &&
                    gwObj.policy['access-policy-name']
                ) {
                    installedPolicies.add(gwObj.policy['access-policy-name']);
                }
            }
        }

        return installedPolicies;
    }

    /**
     * Call API function and handle response
     */
    private async callFunction(functionCall: ApiCallFunction): Promise<ApiCallResult> {
        const [status, response] = await this.apiCall(functionCall);

        this.success = this.success && [200, 201, 202].includes(status);
        return {
            api_name: functionCall.name,
            arguments: functionCall.arguments || {},
            response: response,
        };
    }
}
