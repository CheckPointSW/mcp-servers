import { defineTool, jsonResult, type AnyToolDef } from '../../types.js';
import { deploymentIdSchema, scrub } from '../shared.js';

export const gcpInfoTools: AnyToolDef[] = [
    defineTool({
        name: 'get_gcp_deployment_info',
        description:
            "Read a GCP deployment's wiring information from GET /deployments/gcp/:id/information, including interceptDeploymentGroupId (the full resource id the customer uses to connect their VPC) and live gateway records. Backend fields pass through with secret-shaped keys removed. interceptDeploymentGroupId is returned before the group exists, so report it with the deployment status, not as proof the group is ready. Gateway addresses are a point-in-time snapshot; re-read rather than reuse them. An empty gateway list alone does not establish deployment health. Report values as returned; for the customer-side steps, use get_deployment_guide.",
        tier: 0,
        schema: {
            id: deploymentIdSchema.describe(
                'GCP deployment id from get_deployments'
            ),
        },
        handler: async (args, ctx) =>
            jsonResult(scrub(await ctx.api.cpcf.getGcpDeploymentInfo(args.id))),
    }),
];
