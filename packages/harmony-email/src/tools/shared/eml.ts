import PostalMime, { type Email } from 'postal-mime';
import type { HarmonyEmailAPIManager } from '../../api-manager.js';

/**
 * Shared `.eml` fetch and parse helpers for the `read_email_*` tools.
 *
 * All three views serve the ORIGINAL stored message - the copy HEC captured as
 * received, before any inline modification - fetched through the same
 * `/download/entity/{id}` endpoint as `download_entity` with `original=true`,
 * so the pipeline-added headers survive.
 */

export const ORIGINAL_COPY_NOTE =
    'This is the original message as HEC received it, BEFORE inline modifications - ' +
    'smart banners and link rewrites are not visible here; use get_entity to see the ' +
    'actions HEC applied.';

/** The stored bytes, unparsed. */
export async function fetchBytes(
    api: HarmonyEmailAPIManager,
    entityId: string
): Promise<Uint8Array> {
    const { bytes } = await api.downloadEntity(entityId, { original: true });
    return bytes;
}

export async function fetchMessage(
    api: HarmonyEmailAPIManager,
    entityId: string
): Promise<{ bytes: Uint8Array; email: Email }> {
    const bytes = await fetchBytes(api, entityId);
    const email = await PostalMime.parse(bytes);
    return { bytes, email };
}

/** A high surrogate with no low after it, or a low with no high before it. */
const LONE_SURROGATE =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Escape lone surrogates from 8-bit payloads that would otherwise break JSON.
 *
 * Unpaired ones only: matching every surrogate code unit would also split
 * valid non-BMP characters, turning an emoji in a subject or a body into a
 * literal `\ud83d\ude00` in the analyst's view.
 */
export function jsonSafe(text: string): string {
    return text.replace(
        LONE_SURROGATE,
        (c) => `\\u${c.charCodeAt(0).toString(16)}`
    );
}

/** Escape every non-ASCII byte - for showing a RAW payload as stored. */
export function printableAscii(text: string): string {
    return [...text]
        .map((c) => {
            const code = c.codePointAt(0) ?? 0;
            if (code >= 0x20 && code <= 0x7e) return c;
            if (c === '\n' || c === '\r' || c === '\t') return c;
            return `\\x${code.toString(16).padStart(2, '0')}`;
        })
        .join('');
}

const SKIP_ELEMENTS = /<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Visible text of an HTML body.
 *
 * Regex-based rather than a full HTML parse: script, style and head content is
 * dropped, remaining tags are removed and whitespace collapsed. Good enough for
 * showing an analyst what the recipient read; it is not a sanitiser.
 */
export function stripHtml(html: string): string {
    return html
        .replace(SKIP_ELEMENTS, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface EmailLink {
    href: string;
    text: string;
}

const ANCHOR =
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)(?:<\/a>|$)/gi;

/** Every `<a href>` target with its anchor text, in document order. */
export function extractLinks(html: string): EmailLink[] {
    const links: EmailLink[] = [];
    for (const match of html.matchAll(ANCHOR)) {
        const href = match[1] ?? match[2] ?? match[3] ?? '';
        if (!href) continue;
        links.push({ href, text: stripHtml(match[4] ?? '') });
    }
    return links;
}

// ---- MIME tree --------------------------------------------------------------

/**
 * Ceiling on the parts one walk produces, and with it the recursion depth.
 * A caller that reports truncation passes `MAX_MIME_PARTS + 1`, so a stopped
 * walk is distinguishable from a message holding exactly the cap.
 */
export const MAX_MIME_PARTS = 500;

/** Ceiling on a single sender-written structural field. */
const MAX_FIELD_CHARS = 256;

function capText(value: string): string {
    if (value.length <= MAX_FIELD_CHARS) return value;
    return `${value.slice(0, MAX_FIELD_CHARS)}...`;
}

function capField(value: string | null): string | null {
    return value === null ? null : capText(value);
}

export interface MimePart {
    index: number;
    content_type: string;
    charset: string | null;
    transfer_encoding: string | null;
    filename: string | null;
    size: number;
    is_multipart: boolean;
    /** Body exactly as stored, still transfer-encoded. Not part of the tool output. */
    rawBody: string;
}

function headerValue(headerBlock: string, name: string): string | null {
    // Unfold continuation lines before matching, per RFC 5322 section 2.2.3.
    const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
    const match = new RegExp(`^${name}\\s*:\\s*(.*)$`, 'im').exec(unfolded);
    return match ? match[1].trim() : null;
}

function parameterValue(
    headerLine: string | null,
    name: string
): string | null {
    if (!headerLine) return null;
    const match = new RegExp(
        `${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`,
        'i'
    ).exec(headerLine);
    return match ? (match[1] ?? match[2]) : null;
}

function decodedSize(body: string, encoding: string | null): number {
    const normalized = (encoding ?? '').toLowerCase();
    try {
        if (normalized === 'base64') {
            return Buffer.from(body.replace(/\s+/g, ''), 'base64').length;
        }
        if (normalized === 'quoted-printable') {
            const decoded = body
                .replace(/=\r?\n/g, '')
                .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) =>
                    String.fromCharCode(parseInt(hex, 16))
                );
            return Buffer.byteLength(decoded, 'binary');
        }
    } catch {
        // Malformed encoding: fall through to the raw length.
    }
    return Buffer.byteLength(body, 'utf8');
}

/**
 * RFC 2046: a delimiter is a line of its own, `--boundary`, optionally
 * `--`-suffixed to close the multipart.
 *
 * Line-start is a lookbehind rather than a consumed newline so that two
 * delimiters in a row (an empty part) both match, and the boundary is escaped
 * because it is upstream data, not a pattern.
 */
function boundaryDelimiter(boundary: string): RegExp {
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
        `(?<=^|\\r?\\n)--${escaped}[ \\t]*(--)?[ \\t]*(?:\\r?\\n|$)`,
        'g'
    );
}

/**
 * The body parts between a multipart's boundary delimiter lines.
 *
 * Everything before the first delimiter is the preamble and everything after
 * the closing `--boundary--` is the epilogue; both are dropped.
 */
function splitOnBoundary(body: string, boundary: string): string[] {
    const delimiter = boundaryDelimiter(boundary);
    const segments: string[] = [];
    let sectionStart: number | null = null;
    let match: RegExpExecArray | null;

    while ((match = delimiter.exec(body)) !== null) {
        if (sectionStart !== null) {
            segments.push(body.slice(sectionStart, match.index));
        }
        if (match[1] !== undefined) return segments; // closing delimiter
        sectionStart = match.index + match[0].length;
    }
    // Unterminated multipart: take what is left rather than dropping the part.
    if (sectionStart !== null) segments.push(body.slice(sectionStart));
    return segments;
}

/**
 * Walk the MIME tree in document order.
 *
 * Only structure is needed here - content type, charset, transfer encoding,
 * filename, decoded size - plus each part's still-encoded body so a caller can
 * sample it. Decoding of the actual message content is postal-mime's job.
 *
 * The walk stops at `limit` parts.
 */
export function walkMimeParts(raw: string, limit = MAX_MIME_PARTS): MimePart[] {
    const parts: MimePart[] = [];

    const visit = (section: string): void => {
        if (parts.length >= limit) return;
        const separator = /\r?\n\r?\n/.exec(section);
        const headerBlock = separator
            ? section.slice(0, separator.index)
            : section;
        const body = separator
            ? section.slice(separator.index + separator[0].length)
            : '';

        const contentTypeLine = headerValue(headerBlock, 'Content-Type');
        const contentType = (contentTypeLine?.split(';')[0] ?? 'text/plain')
            .trim()
            .toLowerCase();
        const transferEncoding = headerValue(
            headerBlock,
            'Content-Transfer-Encoding'
        );
        const dispositionLine = headerValue(headerBlock, 'Content-Disposition');
        const boundary = parameterValue(contentTypeLine, 'boundary');
        const isMultipart =
            contentType.startsWith('multipart/') && boundary !== null;

        parts.push({
            index: parts.length,
            content_type: capText(contentType),
            charset: capField(parameterValue(contentTypeLine, 'charset')),
            transfer_encoding: capField(transferEncoding),
            filename: capField(
                parameterValue(dispositionLine, 'filename') ??
                    parameterValue(contentTypeLine, 'name')
            ),
            size: isMultipart ? 0 : decodedSize(body, transferEncoding),
            is_multipart: isMultipart,
            rawBody: isMultipart ? '' : body,
        });

        if (!isMultipart) return;

        // Split on delimiter *lines* only, dropping the preamble and epilogue.
        // A bare `body.split('--' + boundary)` would also cut on the token
        // appearing mid-line inside a part, which a crafted message can do to
        // shift the part indices an analyst then reads back.
        for (const segment of splitOnBoundary(body, boundary)) {
            if (parts.length >= limit) return;
            visit(segment);
        }
    };

    visit(raw);
    return parts;
}

/**
 * The header block exactly as stored: original order, original casing, folding
 * intact. postal-mime normalises header keys to lowercase, which is fine for
 * lookups but loses fidelity in a view whose whole point is being verbatim.
 */
export function rawHeaderBlock(bytes: Uint8Array): string {
    const text = Buffer.from(bytes).toString('binary');
    const separator = /\r?\n\r?\n/.exec(text);
    return separator ? text.slice(0, separator.index) : text;
}
