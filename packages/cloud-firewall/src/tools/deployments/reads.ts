import { z } from 'zod';
import { defineTool, jsonResult, type AnyToolDef } from '../types.js';
import { awsConnection, deploymentIdSchema, scrub } from './shared.js';

export { scrub };

const id = deploymentIdSchema.describe('Deployment id from get_deployments');

export const deploymentReadTools: AnyToolDef[] = [
    defineTool({
        name: 'get_deployments',
        description:
            'List tenant deployments from GET /deployments. Returns backend fields, including provisioning status, error and deletionStatus when present; secret-shaped keys are removed. Present deployments as a table with one row per deployment. Always include Name, Vendor, Region, Status, Plan, Throughput (Gbps), and Management Type. Keep these columns even when every deployment shares the same value; do not replace them with prose. Show missing values as "Not returned". GCP deployments have no throughput tier (they autoscale), so show their Throughput as "N/A (autoscaling)" whatever value is returned. Include errors or deletion status when present. Follow any explicit user request for a different format.',
        tier: 0,
        schema: {},
        handler: async (_args, ctx) =>
            jsonResult(scrub(await ctx.api.cpcf.getDeployments())),
    }),
    defineTool({
        name: 'deployment_status',
        description:
            'Read current provisioning status, errors, deletion status, settings and connection details with secret-shaped fields removed. Active means provisioning completed; gateway health and traffic protection require separate verification.',
        tier: 0,
        schema: { id },
        handler: async (args, ctx) => {
            const deployment = await ctx.api.cpcf.getDeployment(args.id);
            const customerConnection = awsConnection(deployment);
            const result = jsonResult({
                ...(scrub(deployment) as object),
                ...(customerConnection && { customerConnection }),
            });
            if (deployment.vendor === 'gcp') {
                result.content.push(
                    ...jsonResult({
                        interpretation: {
                            throughput:
                                'GCP autoscales and has no throughput tier. Do not present a returned throughput value as capacity.',
                            wiring: 'For intercept deployment group and live gateway addresses, use get_gcp_deployment_info when that information is needed; this status read does not verify them.',
                        },
                    }).content
                );
            }
            return result;
        },
    }),
    defineTool({
        name: 'get_deployment_gateways',
        description:
            'Read gateway records from GET /deployments/:id/gateways. Returns backend observations without deriving a protection verdict. An empty list alone does not establish deployment health. GCP gateways are not listed here; use get_gcp_deployment_info.',
        tier: 0,
        schema: { id },
        handler: async (args, ctx) =>
            jsonResult(
                scrub(await ctx.api.cpcf.getDeploymentGateways(args.id))
            ),
    }),
    defineTool({
        name: 'get_deployment_monitoring',
        description:
            'Read traffic metrics from GET /deployments/:id/monitoring. Optional from/to values are epoch seconds, not milliseconds. Omit both to use the backend default window. Missing data is reported explicitly; this tool does not infer whether traffic is protected.',
        tier: 0,
        schema: {
            id,
            from: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .describe(
                    'Window start in epoch seconds; backend validates the supported range'
                ),
            to: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .describe(
                    'Window end in epoch seconds; backend validates the supported range'
                ),
        },
        handler: async (args, ctx) => {
            const metrics = await ctx.api.cpcf.getDeploymentMonitoring(
                args.id,
                args.from,
                args.to
            );
            return jsonResult(
                metrics === undefined
                    ? {
                          unavailable:
                              'The monitoring endpoint returned an empty response; no metrics were provided for this deployment/window.',
                      }
                    : scrub(metrics)
            );
        },
    }),
];
