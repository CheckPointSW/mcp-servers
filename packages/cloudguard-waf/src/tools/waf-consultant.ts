/**
 * waf_consultant - CloudGuard WAF best-practice recommendations
 * Uses official docs to ground advice.
 * Supports both GitBook MCP (default) and Check Point Documentation Tool API backends.
 */

import type { DocSearchResult, DocCitation } from '../types/waf-consultant.js';
import { WafDocsClient } from '../clients/waf-docs-client.js';
import { DocToolClient } from '../clients/doc-tool-client.js';
import type { Settings } from '../settings.js';

const DOCS_BASE = 'https://waf-doc.inext.checkpoint.com';

function analyzeConfig(config?: Record<string, unknown>): { features: string[]; concerns: string[] } | undefined {
    if (!config || typeof config !== 'object') return undefined;
    const features: string[] = [];
    const concerns: string[] = [];
    const s = JSON.stringify(config).toLowerCase();
    if (s.includes('practice') || s.includes('protection')) features.push('practices');
    if (s.includes('asset') || s.includes('url')) features.push('assets');
    if (s.includes('learn')) concerns.push('Learn mode detected; ensure not used in production.');
    if (s.includes('disabled')) concerns.push('Some protections disabled; verify intentional.');
    return { features, concerns };
}

export interface RunWafConsultantParams {
    user_prompt: string;
    waf_configuration?: Record<string, unknown>;
    agent_uncertainty?: string;
    available_tools: Array<{ name: string; description: string }>;
    conversation_context?: string;
}

/** Structured consultant advice for middleware or programmatic use. */
export interface ConsultantAdvice {
    explanation: string;
    doc_citations?: DocCitation[];
    recommended_tools?: string[];
    risks_or_pitfalls?: string[];
    confidence: number;
    next_action: 'respond' | 'ask_clarify' | 'use_tools';
    backend_used: 'gitbook' | 'documentation-tool';
}

/**
 * Get structured consultant advice. Used by middleware and by runWafConsultant.
 */
export async function getConsultantAdvice(
    params: RunWafConsultantParams,
    settings?: Settings
): Promise<ConsultantAdvice> {
    const configAnalysis = analyzeConfig(params.waf_configuration);
    const query = `CloudGuard WAF ${params.user_prompt}`;

    const docSource = settings?.docSource || process.env.DOC_SOURCE || 'gitbook';

    let explanation = 'No documentation found. Refer to CloudGuard WAF docs for best practices.';
    let doc_citations: DocCitation[] | undefined = undefined;
    let confidence = 0.5;
    let backend_used: 'gitbook' | 'documentation-tool' = 'gitbook';

    if (docSource === 'documentation-tool' && settings) {
        try {
            const docToolClient = new DocToolClient(settings);
            const response = await docToolClient.askDocumentation(query);
            explanation = response;
            doc_citations = [
                {
                    title: 'CloudGuard WAF Documentation',
                    link: DOCS_BASE,
                    snippet: 'Source: Check Point Documentation Tool',
                },
            ];
            confidence = 0.9;
            backend_used = 'documentation-tool';
        } catch (error) {
            console.warn('Documentation Tool failed, falling back to GitBook:', error);
        }
    }

    if (docSource === 'gitbook' || !doc_citations) {
        const client = new WafDocsClient();
        let docResults: DocSearchResult[] = [];
        try {
            docResults = await client.searchDocumentation(query);
        } catch {
            docResults = [];
        }

        if (docResults.length > 0) {
            doc_citations = docResults.slice(0, 5).map((r) => ({
                title: r.title,
                link: r.link || DOCS_BASE,
                snippet: r.content.slice(0, 300) + (r.content.length > 300 ? '...' : ''),
            }));
            explanation =
                docResults[0].content.slice(0, 500) + (docResults[0].content.length > 500 ? '...' : '');
            confidence = 0.8;
        }
    }

    const recommended_tools: string[] = [];
    if (params.user_prompt.toLowerCase().includes('list') || params.user_prompt.toLowerCase().includes('show')) {
        recommended_tools.push('get_objects');
    }
    if (params.user_prompt.toLowerCase().includes('create') || params.user_prompt.toLowerCase().includes('add')) {
        recommended_tools.push('manage_objects');
    }
    if (params.user_prompt.toLowerCase().includes('publish') || params.user_prompt.toLowerCase().includes('deploy')) {
        recommended_tools.push('publish_and_enforce');
    }
    if (recommended_tools.length === 0 && params.available_tools.length > 0) {
        recommended_tools.push(params.available_tools[0].name);
    }

    return {
        confidence,
        next_action: recommended_tools.length > 0 ? 'use_tools' : 'respond',
        explanation,
        backend_used,
        ...(doc_citations && { doc_citations }),
        ...(configAnalysis?.concerns?.length && { risks_or_pitfalls: configAnalysis.concerns }),
        ...(recommended_tools.length > 0 && { recommended_tools }),
    };
}

/**
 * Run waf_consultant tool. Returns text content for MCP response.
 */
export async function runWafConsultant(
    params: RunWafConsultantParams,
    settings?: Settings
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    if (!params.user_prompt || typeof params.user_prompt !== 'string') {
        return {
            content: [{ type: 'text', text: 'user_prompt is required and must be a string.' }],
            isError: true,
        };
    }
    if (!Array.isArray(params.available_tools)) {
        return {
            content: [{ type: 'text', text: 'available_tools is required and must be an array.' }],
            isError: true,
        };
    }

    const output = await getConsultantAdvice(params, settings);

    const backendLabel = output.backend_used === 'documentation-tool'
        ? 'Documentation Tool API'
        : 'GitBook';

    const text = [
        '## WAF Consultant',
        `*Using: ${backendLabel}*`,
        '',
        output.explanation,
        ...(output.doc_citations?.length
            ? ['', '### Documentation citations', ...output.doc_citations.map((c) => `- [${c.title}](${c.link})`)]
            : []),
        ...(output.risks_or_pitfalls?.length
            ? ['', '### Considerations', ...output.risks_or_pitfalls.map((r) => `- ${r}`)]
            : []),
        ...(output.recommended_tools?.length
            ? ['', '### Suggested tools', output.recommended_tools.join(', ')]
            : []),
    ].join('\n');

    return { content: [{ type: 'text', text }] };
}
