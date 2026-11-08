import { z } from 'zod';
import { defineProfile } from './types.js';
import { sicPasswordSchema } from '../sic-password.js';
import { whenOmitted } from '../effective-config.js';
import { managementDiscoveryGuidance } from '../management-discovery.js';

/**
 * Management wiring as the GCP backend contract expresses it: `sicKey`
 * instead of `sicPassword`, comma-joined source CIDRs instead of server IP
 * arrays, an optional type (omitted means self-hosted), and a management name
 * that is embedded in a GCP network tag. Only discovery guidance and SIC secret
 * handling are shared with cp-management.ts, so GCP composes its own profile
 * rather than overriding most of that one.
 */
export const gcpManagementSettingsSchema = z.object({
    type: whenOmitted(
        z
            .enum(['self-hosted', 'smart-1-cloud'])
            .optional()
            .describe(managementDiscoveryGuidance),
        {
            source: 'backend-chooses',
            note: 'self-hosted when omitted, so managementSourceCidrs is required',
        }
    ),
    managementName: z
        .string()
        .min(1)
        .max(44)
        .regex(
            /^[a-z0-9](?:[-a-z0-9]{0,42}[a-z0-9])?$/,
            'must be lowercase letters, digits and hyphens, not ending with a hyphen, 44 characters or fewer'
        )
        .describe(
            'Management object name. It is encoded in x-chkp-management--<name>, so use lowercase letters, digits and hyphens, ending alphanumeric. The 44-character limit keeps the full GCP tag within 63 characters.'
        ),
    // Smart-1 Cloud addresses are Check Point's own, resolved during
    // provisioning, so the field is not applicable there.
    managementSourceCidrs: whenOmitted(
        z
            .string()
            .optional()
            .describe(
                'Comma-separated IPv4 CIDRs, e.g. 10.0.0.0/8,192.168.10.0/24. Required for self-hosted management (including omitted type); omit for smart-1-cloud. These are sources allowed to reach gateway management interfaces. Confirm the management source ranges, accounting for NAT, using the selected management and cloud operations MCPs where available. Do not broaden ranges or automatically convert an object IP into a source CIDR. Backend validates allowed CIDRs.'
            ),
        {
            source: 'not-set',
            appliesWhen: (args) =>
                (args.managementSettings as { type?: string } | undefined)
                    ?.type !== 'smart-1-cloud',
        }
    ),
    sicKey: sicPasswordSchema({ minLength: 8, maxLength: 30 }).describe(
        'SIC one-time key, 8-30 alphanumeric. Only on a local single-user stdio server, "$env:CFW_SIC_OTP" reads it from the server environment; a hosted server cannot read the caller\'s environment and refuses environment references. Reuse the user-supplied value or explicitly chosen environment reference; request a secret source only if unresolved. Never invent it. Write-only; never echo or log it.'
    ),
});

export const gcpManagementProfile = defineProfile({
    schema: { managementSettings: gcpManagementSettingsSchema },
});
