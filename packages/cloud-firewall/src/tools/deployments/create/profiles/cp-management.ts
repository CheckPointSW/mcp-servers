import { z } from 'zod';
import { defineProfile } from './types.js';
import { sicPasswordSchema } from '../sic-password.js';
import { whenOmitted } from '../effective-config.js';
import { managementDiscoveryGuidance } from '../management-discovery.js';

/**
 * Management wiring as this backend contract expresses it: a management
 * type, a SIC password, and the management/log server addresses for a
 * self-hosted estate.
 *
 * A profile rather than inlined in the cloud's create file, because a future
 * cloud whose backend describes the same relationship with a different set
 * of fields (a differently named/bounded SIC secret, source CIDRs instead of
 * server IPs, ...) should compose its own profile instead of overriding most
 * of this one.
 */
export const managementSettingsSchema = z.object({
    type: z
        .enum(['self-hosted', 'smart-1-cloud'])
        .describe(managementDiscoveryGuidance),
    sicPassword: sicPasswordSchema().describe(
        'SIC one-time password, 12-64 alphanumeric. Only on a local stdio server, "$env:CFW_SIC_OTP" reads it from the server environment so the value never appears in the conversation; a hosted server cannot read the caller\'s environment and refuses environment references. Reuse the user-supplied value or explicitly chosen environment reference; request a secret source only if unresolved. Never invent it. Write-only: the backend never stores or returns it, and this server never echoes or logs it.'
    ),
    // Self-hosted only (the backend enforces it), so an omitted list
    // under smart-1-cloud is not applicable rather than "not set".
    managementServerIps: whenOmitted(
        z
            .array(z.string())
            .optional()
            .describe(
                'Required when type is self-hosted: 1-10 management server IPv4 addresses reachable from the new gateways. Use the selected management MCP and cloud network metadata to discover candidates; confirm address mapping instead of copying an API URL or gateway IP.'
            ),
        {
            source: 'not-set',
            appliesWhen: (args) =>
                (args.managementSettings as { type?: string } | undefined)
                    ?.type === 'self-hosted',
        }
    ),
    logServerIps: whenOmitted(
        z
            .array(z.string())
            .optional()
            .describe(
                'Optional: up to 10 log server IPv4 addresses. Discover candidates from log-server objects in the selected management MCP; confirm their role and reachability. Ask only if unresolved and separate log servers are wanted.'
            ),
        { source: 'not-set', note: 'no separate log servers' }
    ),
    // Optional backend create fields. Omitted stays omitted on the wire, and
    // their defaults stay backend-owned: a copied value here would be what
    // the user approves in the preview even after the backend changes it.
    managementName: whenOmitted(
        z
            .string()
            .optional()
            .describe(
                "Optional: the management object name CME provisions against — the 'management=' value in the gateways' x-chkp-tags (up to 64 characters, no ':'). Set only when the customer's CME management object has a different name."
            ),
        {
            source: 'backend-chooses',
            note: 'its default management object name',
        }
    ),
    enableCme: whenOmitted(
        z
            .boolean()
            .optional()
            .describe(
                'Optional: tag the gateways for CME auto-provisioning and create the CME cross-account role. Set false only when the user explicitly opts out of CME.'
            ),
        { source: 'backend-chooses', note: 'its default CME setting' }
    ),
});

export const cpManagementProfile = defineProfile({
    schema: { managementSettings: managementSettingsSchema },
});
