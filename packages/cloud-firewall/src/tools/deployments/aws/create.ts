import { z } from 'zod';
import type { AnyToolDef } from '../../types.js';
import { commonCreateSchema, cpProductClause } from '../create/common.js';
import { makeCreateDeploymentTool } from '../create/factory.js';
import { whenOmitted } from '../create/effective-config.js';
import { DEPLOYMENT_GUIDES } from '../guide.js';

/**
 * AWS CFWaaS deployment creation.
 *
 * Only what is AWS-specific lives here — the vendorSettings schema and the
 * AWS clause of the preview. Everything else (the product
 * contract, the approval wording, the precheck order, the handler) comes from
 * deployments/create/factory.ts and create/common.ts, so it exists once for every
 * cloud. Local validation checks input shape; the backend owns supported values
 * and product limits.
 */

const AZ_ID_HINT =
    'an availability-zone ID like euw1-az1, not a zone name like eu-west-1a';

const vendorSettingsSchema = z.object({
    region: z
        .string()
        .min(1)
        .describe('AWS region for the deployment, e.g. eu-west-1'),
    protectedAccountId: z
        .string()
        .describe(
            'The 12-digit AWS account id whose traffic this deployment protects. Reuse a supplied confirmed target; otherwise ask for it or discover it through the selected authenticated AWS MCP or CLI connection if the user chooses discovery, then confirm it with the user. Do not guess it or assume the current identity is the protected account.'
        ),
    availabilityZones: whenOmitted(
        z
            .array(z.string().min(1))
            .min(1)
            .optional()
            .describe(
                `Optional: selected availability-zone IDs, each ${AZ_ID_HINT}. Backend validates supported zone IDs and count.`
            ),
        { source: 'backend-chooses', note: 'zones selected per environment' }
    ),
});

/** The AWS create request, validated before preview or execution. */
export const awsCreateSchema = z.object({
    ...commonCreateSchema,
    vendorSettings: vendorSettingsSchema,
});

export const awsDeploymentTools: AnyToolDef[] = [
    makeCreateDeploymentTool({
        vendor: 'aws',
        vendorLabel: 'AWS',
        discoveryGuidance:
            'AWS: customer AWS login is optional for gateway deployment. Reuse confirmed target inputs; offer AWS operations MCP or CLI (SSO or explicitly chosen temporary credentials) for optional discovery, or continue with manual inputs. If coverage gaps are relevant to the user’s goal, offer optional network discovery through available AWS tools. If discovery is chosen, preserve the selected MCP connection or CLI profile. Do not list local profiles by default. Only if the user requests profile alternatives, show a short relevant unnumbered rendered table with Profile, Authentication and Configured account/region, marking unverified metadata; determine authentication from configuration, never profile names. Do not auto-probe other profiles. Confirm account/region once before zone lookup. For discovered zones, show standard zone names/IDs, all initially selected; preserve removals and send selected IDs explicitly. Without AWS access, ask for zone IDs or explicit backend zone selection; do not require login or invent zones. Authorized SSO login may retry discovery; expired temporary credentials require user refresh. On discovery failure, explain and offer reconnection or supplied inputs without dumping profile lists. Zone IDs or explicit backend selection are required; omission does not mean all zones.',
        vendorSettingsSchema,
        topLevelSchema: commonCreateSchema,
        vendorClause: (vs) =>
            `in ${vs.region} protecting account ${vs.protectedAccountId}`,
        productClause: cpProductClause,
        postCreateGuidance:
            'Once the deployment is active, deployment_status returns customerConnection with the endpoint service name the customer creates their Gateway Load Balancer endpoint against.',
        deploymentGuideUrl: DEPLOYMENT_GUIDES.aws.main,
    }),
];
