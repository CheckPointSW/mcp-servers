/** Shared by read scrubbing, approval previews and request-error redaction. */
export const SECRET_KEY_PATTERN =
    /password|secret|token|credential|private_?key|sic_?key|sic_?otp|\botp\b|client_?key|passphrase|access_?key|api_?key/i;

/** Collect strings under secret-shaped request keys, including nested containers. */
export function requestSecrets(value: unknown): Set<string> {
    const secrets = new Set<string>();
    function visit(node: unknown, sensitive = false): void {
        if (typeof node === 'string') {
            if (sensitive && node) secrets.add(node);
        } else if (Array.isArray(node)) {
            node.forEach((item) => visit(item, sensitive));
        } else if (node && typeof node === 'object') {
            for (const [key, nested] of Object.entries(node)) {
                visit(nested, sensitive || SECRET_KEY_PATTERN.test(key));
            }
        }
    }
    visit(value);
    return secrets;
}

/** Literal, single-pass replacement; redact before truncating diagnostic text. */
export function secretRedactor(secrets: Set<string>): (text: string) => string {
    const literals = [...secrets]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    if (!literals.length) return (text) => text;
    const pattern = new RegExp(
        literals
            .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|'),
        'g'
    );
    return (text) => text.replace(pattern, '[REDACTED]');
}
