import { createHash, randomBytes } from 'crypto';
import { SessionContext } from '@chkp/mcp-utils';
import type { ToolArgs } from './types.js';

/**
 * Stable fingerprint of the arguments a tier-2 preview described. Binds the
 * exact approved payload to its token entry — the unguessability of the token
 * itself comes from randomBytes, not from this hash. Note the args can include
 * write-only secrets (sicPassword): the hash is one-way, lives only in process
 * memory, and must never be logged or returned to the model.
 */
function fingerprint(args: ToolArgs): string {
    const canonical = JSON.stringify(args, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort())
            : value
    );
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Pending previews belong to the MCP session state. The HTTP transport supplies
 * the mcp-session-id through the callback context; stdio uses the default session.
 * Session teardown clears this state along with the session's other data.
 * State remains in-memory per replica, so multiple replicas need sticky routing.
 */
const CONFIRM_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_PENDING_TOKENS_PER_SESSION = 20;
const PENDING_CONFIRMS_KEY = 'cloud-firewall:pending-confirms';
type PendingConfirms = Map<
    string,
    { tool: string; fingerprint: string; expiresAt: number }
>;

export function issueConfirmToken(
    tool: string,
    extra: unknown,
    args: ToolArgs
): string {
    let pendingConfirms = SessionContext.getData(
        PENDING_CONFIRMS_KEY,
        extra
    ) as PendingConfirms | undefined;
    if (!pendingConfirms) {
        pendingConfirms = new Map();
        SessionContext.setData(PENDING_CONFIRMS_KEY, pendingConfirms, extra);
    }
    const now = Date.now();
    for (const [token, entry] of pendingConfirms) {
        if (entry.expiresAt <= now) pendingConfirms.delete(token);
    }
    // Oldest-first eviction affects only this session's previews.
    while (pendingConfirms.size >= MAX_PENDING_TOKENS_PER_SESSION) {
        const oldest = pendingConfirms.keys().next().value;
        if (oldest === undefined) break;
        pendingConfirms.delete(oldest);
    }
    const token = randomBytes(16).toString('hex');
    pendingConfirms.set(token, {
        tool,
        fingerprint: fingerprint(args),
        expiresAt: now + CONFIRM_TOKEN_TTL_MS,
    });
    return token;
}

export function redeemConfirmToken(
    token: unknown,
    tool: string,
    extra: unknown,
    args: ToolArgs
): boolean {
    if (typeof token !== 'string') return false;
    const pendingConfirms = SessionContext.getData(
        PENDING_CONFIRMS_KEY,
        extra
    ) as PendingConfirms | undefined;
    if (!pendingConfirms) return false;
    const entry = pendingConfirms.get(token);
    if (!entry) return false;
    // Spent on any attempt, match or not: a token presented with altered
    // arguments must not remain redeemable for the originally approved ones.
    pendingConfirms.delete(token);
    const redeemed =
        entry.expiresAt > Date.now() &&
        entry.tool === tool &&
        entry.fingerprint === fingerprint(args);
    if (redeemed) {
        // Re-previewing identical inputs mints a sibling token. Spend those
        // too, so one approval can create at most one deployment even if the
        // model previewed twice or retried after a client timeout.
        for (const [other, pending] of pendingConfirms) {
            if (
                pending.tool === entry.tool &&
                pending.fingerprint === entry.fingerprint
            ) {
                pendingConfirms.delete(other);
            }
        }
    }
    return redeemed;
}
