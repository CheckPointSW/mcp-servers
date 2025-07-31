import { Settings } from './settings.js';
import axios from 'axios';

let tokenCached = '';

export class ReputationClient {
    private settings: Settings;
    private readonly BASE_AUTH_URL = 'https://rep.checkpoint.com/rep-auth/service/v1.0/request';
    private readonly BASE_REP_URL = 'https://rep.checkpoint.com';

    constructor() {
        this.settings = Settings.getSettings();
    }
    /**
     * Get reputation for a resource (URL, IP, or File hash)
     * @param serviceType The type of service ('url', 'ip', or 'file')
     * @param resource The resource to check
     * @returns Promise with reputation data
     */
    async getReputation(serviceType: 'url' | 'ip' | 'file', resource: string) {
        try {
            // Check if token is cached and not expired
            const isTokenExpired = (token: string): boolean => {
                const expMatch = token.match(/exp=(\d+)/);
                if (!expMatch) return true;
                const expTime = parseInt(expMatch[1]) * 1000; // Convert to milliseconds
                return Date.now() >= expTime;
            };

            if (!tokenCached || isTokenExpired(tokenCached)) {
                // First get token
                const tokenResponse = await axios.get(this.BASE_AUTH_URL, {
                    headers: {
                        'Client-Key': this.settings.apiKey
                    }
                });

                if (tokenResponse.status !== 200) {
                    throw new Error(`Failed to get token: ${tokenResponse.status}`);
                }

                tokenCached = tokenResponse.data;
            }

            // Then query reputation
            const repUrl = `${this.BASE_REP_URL}/${serviceType}-rep/service/v3.0/query?resource=${encodeURIComponent(resource)}`;

            const repResponse = await axios.post(repUrl, {
                request: [{
                    resource: resource,
                    context:
                        {
                            platform: "mcp"
                        }
                }]
            }, {
                headers: {
                    'Client-Key': this.settings.apiKey || '',
                    'token': tokenCached,
                    'Content-Type': 'application/json'
                }
            });

            if (repResponse.status !== 200) {
                throw new Error(`Failed to get reputation: ${repResponse.status}`);
            }

            const repData = repResponse.data;

            // Extract and return relevant reputation info
            const response = repData.response[0];
            const risk = response.risk;
            const classification = response.reputation.classification;
            const confidence = response.reputation.confidence;

            return {
                resource,
                risk,
                classification,
                confidence,
                fullResponse: repData
            };
        } catch (error: any) {
            console.error("Error getting reputation with message:", error.message);
            throw error;
        }
    }
}
