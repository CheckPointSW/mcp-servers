/**
 * Documentation Tool Client - calls Check Point Documentation Tool API
 * Uses the same credentials (clientId, accessKey, region) as WAF API.
 * Falls back to DOC_TOOL_CLIENT_ID / DOC_TOOL_SECRET_KEY / DOC_TOOL_REGION if set.
 */

import type { Settings } from '../settings.js';

interface TokenInfo {
    token: string;
    expiresAt: number;
}

interface AuthResponse {
    data: {
        token: string;
        expiresIn: number;
    };
}

interface DocToolResponse {
    response: string;
}

export class DocToolClient {
    private settings: Settings;
    private tokenCache: TokenInfo | null = null;

    constructor(settings: Settings) {
        this.settings = settings;
    }

    /**
     * Get credentials for Documentation Tool.
     * Uses DOC_TOOL_CLIENT_ID/DOC_TOOL_SECRET_KEY if provided, otherwise falls back to WAF credentials.
     */
    private getDocToolCredentials(): { clientId: string; secretKey: string } {
        return {
            clientId: this.settings.docToolClientId || this.settings.clientId,
            secretKey: this.settings.docToolSecretKey || this.settings.secretKey,
        };
    }

    /**
     * Map WAF region to Documentation Tool region.
     * Uses DOC_TOOL_REGION if provided, otherwise DEV maps to EU, others use their own region.
     */
    private getDocToolRegion(): string {
        if (this.settings.docToolRegion) {
            return this.settings.docToolRegion.toUpperCase();
        }
        return this.settings.region === 'DEV' ? 'EU' : this.settings.region;
    }

    /**
     * Get gateway host for Documentation Tool based on region mapping.
     */
    private getDocToolGateway(): string {
        const region = this.getDocToolRegion();
        switch (region.toUpperCase()) {
            case 'EU':
                return 'https://cloudinfra-gw.portal.checkpoint.com';
            case 'US':
                return 'https://cloudinfra-gw-us.portal.checkpoint.com';
            case 'AU':
                return 'https://cloudinfra-gw.ap.portal.checkpoint.com';
            case 'IN':
                return 'https://cloudinfra-gw.in.portal.checkpoint.com';
            case 'AE':
                return 'https://cloudinfra-gw.ae.portal.checkpoint.com';
            case 'CA':
                return 'https://cloudinfra-gw.ca.portal.checkpoint.com';
            default:
                return 'https://cloudinfra-gw.portal.checkpoint.com';
        }
    }

    private getAuthUrl(): string {
        return `${this.getDocToolGateway()}/auth/external/user`;
    }

    private getDocToolUrl(): string {
        return `${this.getDocToolGateway()}/app/console-one/api/v1/doc/ask_docs`;
    }

    private async getToken(): Promise<string> {
        const credentials = this.getDocToolCredentials();

        if (!credentials.clientId || !credentials.secretKey) {
            throw new Error(
                'Client ID and Secret Key are required for Documentation Tool authentication ' +
                '(set DOC_TOOL_CLIENT_ID/DOC_TOOL_SECRET_KEY or WAF_CLIENT_ID/WAF_ACCESS_KEY)'
            );
        }

        if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
            return this.tokenCache.token;
        }

        const authUrl = this.getAuthUrl();
        const response = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: credentials.clientId,
                accessKey: credentials.secretKey,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No response body');
            const creds = this.getDocToolCredentials();
            const debugInfo = [
                `Auth URL: ${authUrl}`,
                `WAF Region: ${this.settings.region}`,
                `DocTool Region: ${this.getDocToolRegion()}`,
                `ClientId: ${creds.clientId?.substring(0, 8)}...`,
                `Using separate DocTool creds: ${!!this.settings.docToolClientId}`,
            ].join(', ');
            throw new Error(
                `Failed to get auth token: ${response.statusText} (${response.status}). ${errorText}. Debug: ${debugInfo}`
            );
        }

        const authData = (await response.json()) as AuthResponse;
        const token = authData.data.token;
        const expiresIn = authData.data.expiresIn;

        if (!token || !expiresIn) {
            throw new Error('Invalid token response from auth server');
        }

        this.tokenCache = {
            token,
            expiresAt: Date.now() + expiresIn * 1000 - 5000,
        };

        return token;
    }

    async askDocumentation(question: string): Promise<string> {
        const token = await this.getToken();

        const response = await fetch(this.getDocToolUrl(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question,
                product: 'appsec',
                skip_llm: true,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No response body');
            throw new Error(
                `Documentation Tool request failed: ${response.statusText} (${response.status}). ${errorText}`
            );
        }

        const data = (await response.json()) as DocToolResponse;
        return data.response || 'No response received from Documentation Tool.';
    }
}
