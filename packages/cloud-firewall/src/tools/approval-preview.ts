interface PreviewField {
    path: string;
    value: unknown;
    source: string;
}

/** Render untrusted approval values as literal text in summaries and tables. */
export const escapeApprovalText = (value: unknown): string =>
    (typeof value === 'string' ? value : (JSON.stringify(value) ?? ''))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Values are literal text, even when they contain Markdown links,
        // images, code spans or emphasis. Escape backslashes in the same pass.
        .replace(/[\\|`*_[\]~!]/g, '\\$&')
        .replace(/[\r\n]+/g, ' ');

const label = (path: string): string =>
    escapeApprovalText(
        (path.split('.').pop() ?? path)
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .toLowerCase()
    );

/** Render the approval view in code; the full configuration stays available as details. */
export function approvalPreview(fields: PreviewField[]): string {
    const visible = fields.filter(
        (field) =>
            field.source !== 'backend-chooses' && field.source !== 'not-set'
    );
    const rows = visible.map(
        (field) =>
            `| ${label(field.path)} | ${escapeApprovalText(field.value)} | ${escapeApprovalText(field.source)} |`
    );
    const defaults = fields.filter(
        (field) => field.source === 'backend-chooses'
    );
    if (defaults.length)
        rows.push(
            `| Advanced settings | Backend defaults (${defaults.map((field) => label(field.path)).join(', ')}). Actual values are not returned by this preview. | backend-chooses |`
        );
    const unset = fields.filter((field) => field.source === 'not-set');
    if (unset.length)
        rows.push(
            `| Unset optional settings | ${unset.map((field) => `${label(field.path)}: ${escapeApprovalText(field.value)}`).join('; ')} | not-set |`
        );
    return ['| Field | Value | Source |', '|---|---|---|', ...rows].join('\n');
}
