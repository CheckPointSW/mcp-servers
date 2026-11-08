import { CpcfApiError } from '../clients/cpcf.js';

/**
 * An error that authored its own model-facing text.
 *
 * Structural, not nominal, so a client can opt in without this module importing
 * it: set `safeForModel` when the message is written by us and describes what to
 * do, as opposed to being copied out of an upstream response body. Optionally
 * provide `toModelText(toolName)` when the text should name the tool.
 *
 * Setting this flag is a decision that the message contains no auth
 * diagnostics, internal hostnames or stack traces, since it goes straight into
 * the model's context.
 */
interface ModelSafeError {
    readonly safeForModel?: boolean;
    toModelText?(toolName: string): string;
}

export function modelSafeText(
    error: Error,
    toolName: string
): string | undefined {
    const candidate = error as unknown as ModelSafeError;
    if (candidate.safeForModel !== true) return undefined;
    return typeof candidate.toModelText === 'function'
        ? candidate.toModelText(toolName)
        : error.message;
}

/**
 * Text the model is allowed to see for a caller-correctable CPCF rejection,
 * or undefined for everything else (which stays generic). Relaying the
 * client's sanitized line plus the backend's client-facing validation message
 * lets the model fix its arguments instead of retrying blind against an
 * "internal error". Which statuses qualify — and that the relayed text never
 * contains the response body — is decided once, on CpcfApiError itself.
 */
export function callerCorrectableFailureText(
    error: Error,
    tier: number
): string | undefined {
    if (!(error instanceof CpcfApiError) || !error.isCallerCorrectable) {
        return undefined;
    }
    // Only a tier-2 tool has a preview/confirm flow to redo.
    const retry = tier === 2 ? 'try again from a fresh preview' : 'try again';
    return `${error.toModelText()}. The request was rejected by the backend — fix the arguments and ${retry}.`;
}
