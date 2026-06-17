/**
 * WAF Documentation Client - HTTP POST to GitBook MCP
 * Server: https://waf-doc.inext.checkpoint.com/~gitbook/mcp
 */

import type { DocSearchResult } from '../types/waf-consultant.js';

const DEFAULT_BASE_URL = 'https://waf-doc.inext.checkpoint.com/~gitbook/mcp';

interface MCPRequest {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
    id: number | string;
}

interface MCPResponse {
    jsonrpc: '2.0';
    id: number | string;
    result?: unknown;
    content?: Array<{ type: string; text?: string }>;
    error?: { code: number; message: string };
}

export class WafDocsClient {
    private readonly baseURL: string;
    private requestId = 0;

    constructor(baseURL?: string) {
        this.baseURL = baseURL || DEFAULT_BASE_URL;
    }

    private async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
        const request: MCPRequest = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: toolName, arguments: args },
            id: ++this.requestId,
        };
        const res = await fetch(this.baseURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(request),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = (await res.json()) as MCPResponse;
        if (data.error) throw new Error(`MCP Error: ${data.error.message}`);
        if (data.content) return data;
        return data.result;
    }

    async searchDocumentation(query: string): Promise<DocSearchResult[]> {
        try {
            const result = (await this.callTool('searchDocumentation', { query })) as
                | { content?: Array<{ type: string; text?: string }> }
                | DocSearchResult[];
            if (Array.isArray(result)) return this.normalizeResults(result);
            if (result?.content?.length) {
                const results: DocSearchResult[] = [];
                for (const item of result.content) {
                    if (item.type === 'text' && item.text) {
                        const parsed = this.parseText(item.text);
                        if (parsed) results.push(parsed);
                    }
                }
                return results;
            }
            return [];
        } catch {
            return [];
        }
    }

    private parseText(text: string): DocSearchResult | null {
        const titleMatch = text.match(/^Title:\s*(.+?)$/m);
        const linkMatch = text.match(/^Link:\s*(.+?)$/m);
        const contentMatch = text.match(/^Content:\s*(.+)$/ms);
        if (!titleMatch || !contentMatch) return null;
        return {
            title: titleMatch[1].trim(),
            link: linkMatch ? linkMatch[1].trim() : 'https://waf-doc.inext.checkpoint.com',
            content: contentMatch[1].trim(),
            score: 1.0,
        };
    }

    private normalizeResults(results: unknown[]): DocSearchResult[] {
        return (results as Record<string, unknown>[]).map((item) => ({
            title: (item.title ?? item.Title ?? item.name ?? 'Documentation Result') as string,
            content: (item.content ?? item.Content ?? item.text ?? item.snippet ?? '') as string,
            link: (item.link ?? item.Link ?? item.url ?? 'https://waf-doc.inext.checkpoint.com') as string,
            score: typeof item.score === 'number' ? item.score : 1.0,
        }));
    }
}
