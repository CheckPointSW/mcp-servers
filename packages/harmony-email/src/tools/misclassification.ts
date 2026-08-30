import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handle, registerTool } from './shared/result.js';
import { apiFor } from './shared/session.js';
import type { ServerModule } from './types.js';

const CLASSIFICATIONS = [
    'phishing',
    'suspicious_phishing',
    'malware',
    'suspicious_malware',
    'spam',
    'graymail',
    'dlp',
    'clean',
] as const;

const CONFIDENCES = ['low', 'medium', 'high'] as const;

const DESCRIPTION = `Submit a verdict correction for one or more HEC entities: "this email was flagged as X but is actually Y".

WHEN TO USE:
- A false positive (use \`classification: "clean"\`) or a false negative (use the specific category)
- The analyst has decided the engine verdict is wrong and wants that fed back

REQUIRED:
- \`entity_ids\` (1 to 100 entity ids), \`classification\` (the claimed correct verdict), and \`confident\` (low, medium or high; defaults to medium)

DEFAULT BEHAVIOR:
- \`confirm: false\` (the default) returns a dry-run preview so the analyst can verify the entity list, and makes no upstream call. Re-call with \`confirm: true\` to actually submit
- The response carries no detail beyond the acknowledgement: misclassification feedback is fire-and-forget on the public API side`;

interface MisclassificationArgs {
    entity_ids: string[];
    classification: (typeof CLASSIFICATIONS)[number];
    confident?: (typeof CONFIDENCES)[number];
    confirm?: boolean;
}

export function registerMisclassificationTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    registerTool<MisclassificationArgs>(
        server,
        'report_misclassification',
        DESCRIPTION,
        {
            entity_ids: z
                .array(z.string().min(1).max(256))
                .min(1)
                .max(100)
                .describe('Entity ids whose verdict is being corrected.'),
            classification: z
                .enum(CLASSIFICATIONS)
                .describe('The verdict the reporter believes is correct.'),
            confident: z
                .enum(CONFIDENCES)
                .default('medium')
                .describe('How confident the reporter is in the correction.'),
            confirm: z
                .boolean()
                .default(false)
                .describe(
                    '`false` (default): dry-run preview, no upstream call. `true`: actually submit.'
                ),
        },
        async (args, extra) =>
            handle('report_misclassification', async () => {
                const confident = args.confident ?? 'medium';
                const preview = {
                    entity_ids: args.entity_ids,
                    classification: args.classification,
                    confident,
                };

                if (!args.confirm) {
                    return { submitted: false, dry_run: true, ...preview };
                }

                await apiFor(serverModule, extra).reportMisclassification(
                    args.entity_ids,
                    args.classification,
                    confident
                );
                return { submitted: true, dry_run: false, ...preview };
            }),
        { readOnlyHint: false, idempotentHint: false }
    );
}
