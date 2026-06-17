/**
 * Type definitions for WAF Consultant Tool
 */

export type DocSource = 'gitbook' | 'documentation-tool';

export interface WafConsultantInput {
    user_prompt: string;
    waf_configuration?: Record<string, unknown>;
    agent_uncertainty?: string;
    available_tools: AvailableTool[];
    conversation_context?: string;
}

export interface AvailableTool {
    name: string;
    description: string;
}

export interface WafConsultantOutput {
    confidence: number;
    next_action: 'respond' | 'ask_clarify' | 'use_tools';
    explanation: string;
    recommendations?: Recommendation[];
    clarifying_questions?: string[];
    recommended_tools?: string[];
    tool_plan?: ToolPlan[];
    doc_citations?: DocCitation[];
    risks_or_pitfalls?: string[];
}

export interface Recommendation {
    title: string;
    description: string;
    rationale: string;
    severity: 'low' | 'medium' | 'high';
}

export interface ToolPlan {
    tool_name: string;
    purpose: string;
    suggested_input: Record<string, unknown>;
}

export interface DocCitation {
    title: string;
    link: string;
    snippet: string;
}

export interface DocSearchResult {
    title: string;
    link?: string;
    content: string;
    score?: number;
    metadata?: Record<string, unknown>;
}

export interface ConfigAnalysis {
    features: string[];
    practice_modes: string[];
    asset_types: string[];
    protection_settings: Record<string, unknown>;
    patterns: string[];
    concerns: string[];
}

export interface DocSearchContext {
    user_prompt: string;
    config_analysis?: ConfigAnalysis;
    agent_uncertainty?: string;
    conversation_context?: string;
}

export interface RecommendationContext {
    config_analysis?: ConfigAnalysis;
    doc_results: DocSearchResult[];
    user_prompt: string;
}

export interface ToolRecommendationContext {
    user_prompt: string;
    available_tools: AvailableTool[];
    config_analysis?: ConfigAnalysis;
    doc_results: DocSearchResult[];
}
