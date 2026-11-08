import { z } from 'zod';
import { defineTool, jsonResult, type AnyToolDef } from '../../types.js';
import { deploymentIdSchema } from '../shared.js';
import { scrub } from '../reads.js';
import { asynchronousObservationGuidance } from '../../../instructions.js';

const id = deploymentIdSchema.describe(
    'Azure deployment id from get_deployments'
);

// Advisory only: customer-cloud authorization remains outside this MCP.
const permissionGuidance =
    'The deployment app identity (the appId from deployment_status, in the customer subscription tenant) needs permission to create peerings with each customer VNet. Any IAM change requires explicit user authorization. This MCP does not check or grant Azure permissions.';

/** Keep guidance separate so existing backend payloads and future fields retain their shape. */
function peeringResult(
    payload: unknown,
    deploymentId: string,
    submitted: boolean
) {
    const result = jsonResult(scrub(payload));
    result.content.push(
        ...jsonResult({
            next: {
                tool: 'get_azure_vnet_peerings',
                arguments: { id: deploymentId },
                reason: submitted
                    ? 'The request was accepted; peering connection happens asynchronously. Check the records matching the returned peering IDs.'
                    : 'Report backend statuses and any failure details. Read again when another observation is needed.',
                guidance: `${asynchronousObservationGuidance} For a standalone read, report the observation. An empty list or an unfamiliar status does not establish completion or prove connectivity is absent. If a write outcome is unclear, read existing records before requesting again.`,
            },
            permissionGuidance,
            troubleshooting:
                'For a failed peering, report any backend error fields verbatim. If no cause is returned, say so and do not guess one. Request the failed network again only with a fresh approved preview. Do not retry automatically.',
            remainingSetup:
                'Peering alone does not verify routing, policy or traffic protection.',
        }).content
    );
    return result;
}

/** Thin adapters: the backend owns peering validation, permissions and reconciliation. */
export const azurePeeringTools: AnyToolDef[] = [
    defineTool({
        name: 'add_azure_vnet_peerings',
        description:
            'Request Azure VNet peerings. Call with confirm: false for a local input-shape preview; it never creates resources and needs no separate user approval. Show the returned willDo and warnings, including the customer-VNet permission prerequisite. Submit only after explicit preview approval, using confirm: true with its confirmToken and unchanged inputs. Backend validation, permissions and asynchronous reconciliation remain authoritative. Does not change workload routes, NSGs or management configuration. Acceptance or a connected peering does not verify traffic protection. For an uncertain write outcome, read peerings before resubmitting.',
        tier: 2,
        schema: {
            id,
            vnetResourceIds: z
                .array(z.string().min(1))
                .min(1)
                .describe(
                    'Full customer Azure VNet resource ids to peer with this deployment, e.g. /subscriptions/SUBSCRIPTION_ID/resourceGroups/RESOURCE_GROUP/providers/Microsoft.Network/virtualNetworks/VNET_NAME. Discover available VNets with an available Azure MCP server or CLI and confirm the intended networks with the user. The backend validates format, uniqueness and supported limits.'
                ),
        },
        precheck: async () => ({
            problems: [],
            warnings: [
                permissionGuidance,
                'This preview checks input shape only. Azure permissions, network compatibility and backend acceptance remain unverified; the backend processes the approved request asynchronously.',
            ],
        }),
        previewSummary: (args) =>
            `Request VNet peerings for Azure deployment ${JSON.stringify(args.id)} with these customer networks: ${JSON.stringify(args.vnetResourceIds)}. This changes cloud connectivity and may incur Azure charges. Workload routes, NSGs and management configuration are not changed.`,
        handler: async (args, ctx) =>
            peeringResult(
                await ctx.api.cpcf.addVnetPeerings(
                    args.id,
                    args.vnetResourceIds
                ),
                args.id,
                true
            ),
    }),
    defineTool({
        name: 'get_azure_vnet_peerings',
        description:
            'Read Azure VNet peering records from GET /deployments/:id/vnet-peerings. Returns backend fields and observed statuses with secret-shaped keys removed. Show each network and its status; keep additional backend fields. A connected peering is not verification of gateway health, installed policy, routing or traffic protection. An empty list means no peering records were returned. Separate next-step guidance describes follow-up checks without interpreting statuses.',
        tier: 0,
        schema: { id },
        handler: async (args, ctx) =>
            peeringResult(
                await ctx.api.cpcf.getVnetPeerings(args.id),
                args.id,
                false
            ),
    }),
];
