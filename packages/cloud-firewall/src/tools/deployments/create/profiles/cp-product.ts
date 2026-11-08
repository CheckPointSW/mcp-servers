import { z } from 'zod';
import { defineProfile } from './types.js';
import { whenOmitted } from '../effective-config.js';
import type { managementSettingsSchema } from './cp-management.js';

/**
 * The Check Point product decisions as this backend contract expresses them:
 * a throughput number, a licensing plan and a gateway version.
 *
 * A profile rather than inlined in the cloud's create file, because a future
 * cloud whose backend contract sizes the estate differently (e.g. through
 * autoscaler settings inside its own vendorSettings) should not have to
 * import fields it does not send.
 */
export const cpProductProfile = defineProfile({
    schema: {
        throughput: z
            .number()
            .int()
            .min(1)
            .describe(
                'Protected throughput in Gbps; backend validates supported capacity'
            ),
        plan: z
            .string()
            .min(1)
            .describe(
                'Security plan, e.g. NGFW, NGTP or NGTX; backend validates supported plans'
            ),
        // backend-chooses, not a pinned 'R82': the backend's default
        // version moves with its release catalog, and a pinned copy here
        // would have the user approve a version that is no longer applied.
        gatewayVersion: whenOmitted(
            z
                .string()
                .min(1)
                .optional()
                .describe('Optional gateway version, e.g. R82.'),
            { source: 'backend-chooses', note: 'its current default version' }
        ),
    },
});

/**
 * The product half of the tier-2 preview sentence for a throughput-billed
 * cloud. Lives beside the schema it describes so the wording and the fields
 * cannot drift, and is passed to makeCreateDeploymentTool rather than being
 * hardcoded there — a cloud with no `plan` or `throughput` needs a different
 * sentence, not an interpolation of undefined values.
 *
 * Typed against the fields it renders, so pairing it with a create schema
 * that lacks them (a cloud that composes neither this profile nor the
 * management profile) is a compile error rather than "undefined plan" in the
 * text a user approves. Includes no secrets.
 */
export function cpProductClause(args: CpProductClauseArgs): string {
    const management = args.managementSettings;
    // Don't assert a gatewayVersion we aren't sending — when it's omitted the
    // backend picks, and the preview must describe what will happen.
    // enableCme is named only on an explicit opt-out, because that changes
    // the outcome materially (no CME tagging, no cross-account role).
    return (
        `${args.plan} plan, ${args.throughput} Gbps, ` +
        `gateway ${args.gatewayVersion ?? '(backend default)'}, ` +
        `${management?.type} management` +
        `${management?.enableCme === false ? ' (CME auto-provisioning disabled)' : ''}`
    );
}

/** What cpProductClause reads: this profile's fields plus the management block. */
type CpProductClauseArgs = z.infer<
    z.ZodObject<typeof cpProductProfile.schema>
> & {
    managementSettings?: z.infer<typeof managementSettingsSchema>;
};
