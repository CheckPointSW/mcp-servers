import { z } from 'zod';
import type { AnyToolDef } from '../../types.js';
import { baseProfile } from '../create/profiles/base.js';
import { cpProductProfile } from '../create/profiles/cp-product.js';
import { gcpManagementProfile } from '../create/profiles/gcp-management.js';
import { makeCreateDeploymentTool } from '../create/factory.js';
import { whenOmitted } from '../create/effective-config.js';

// Current CFWaaS GCP API requires a plan, but uses autoscaling instead of throughput.
const topLevelSchema = {
    ...baseProfile.schema,
    plan: cpProductProfile.schema.plan,
    ...gcpManagementProfile.schema,
};
const optionalText = () => z.string().optional();
const optionalCount = () => z.number().int().optional();
// The backend documents values for these, but passes an omitted field
// through to provisioning rather than applying it in the request contract,
// so this server does not restate them as fixed defaults.
const backendDefault = <T extends z.ZodTypeAny>(
    field: T,
    description: string
) =>
    whenOmitted(field.describe(description), {
        source: 'backend-chooses',
        note: 'its default',
    });
const vendorSettingsSchema = z.object({
    region: z
        .string()
        .min(1)
        .describe(
            'GCP region, e.g. europe-west1; backend validates supported regions'
        ),
    serviceAccountEmail: z
        .string()
        .min(1)
        .describe(
            'Existing customer GCP service account the gateways run as, e.g. cfwaas-gw@my-project.iam.gserviceaccount.com. Reuse a supplied confirmed identity; otherwise discover candidates through the selected authenticated GCP MCP or gcloud CLI connection and confirm the project and identity with the user. Listing an account does not establish deployment permissions.'
        ),
    machineType: backendDefault(
        optionalText(),
        'Optional gateway machine type.'
    ),
    osVersion: backendDefault(
        optionalText(),
        'Optional gateway OS version; GCP uses compact names such as R8120, R82 or R8210. Backend validates supported versions.'
    ),
    ipStackType: backendDefault(
        optionalText(),
        'Optional IP stack, e.g. IPV4_ONLY or IPV4_IPV6; backend validates supported values.'
    ),
    instancesMinGroupSize: backendDefault(
        optionalCount(),
        'Optional autoscaling minimum instance count.'
    ),
    instancesMaxGroupSize: backendDefault(
        optionalCount(),
        'Optional autoscaling maximum instance count; backend validates it against the minimum.'
    ),
    cpuUsage: backendDefault(
        optionalCount(),
        'Optional autoscaler target CPU percentage; backend validates supported limits.'
    ),
    diskType: backendDefault(
        optionalText(),
        'Optional disk type, e.g. SSD Persistent Disk or Standard Persistent Disk; sent verbatim.'
    ),
    diskSize: backendDefault(
        optionalCount(),
        'Optional gateway disk size in GB; backend validates supported sizes.'
    ),
});
export const gcpCreateSchema = z.object({
    ...topLevelSchema,
    vendorSettings: vendorSettingsSchema,
});
export const gcpDeploymentTools: AnyToolDef[] = [
    makeCreateDeploymentTool({
        vendor: 'gcp',
        vendorLabel: 'GCP',
        discoveryGuidance:
            'GCP: follow the shared deployment intake flow; reuse confirmed target inputs and the selected MCP connection or CLI context. If disconnected, offer connection through an available GCP operations MCP or gcloud CLI, or accept a supplied project and region for manual intake. If coverage gaps are relevant to the user’s goal, offer optional network discovery through available GCP tools. Do not enumerate projects, accounts or CLI configurations by default; show a short relevant project picker as an unnumbered rendered table only when the user requests alternatives. Discover unresolved service-account and region choices read-only through the confirmed connection. Pass the selected context explicitly; never change defaults. Discovery identity differs from serviceAccountEmail, the gateway runtime identity. On auth failure, explain and offer authorized reauthentication while preserving user/service-account/federated authentication. Confirm project and gateway service account; never infer permissions from names.',
        topLevelSchema,
        vendorSettingsSchema,
        vendorClause: (vs) =>
            `in ${vs.region} running as ${vs.serviceAccountEmail}`,
        postCreateGuidance:
            'Once the deployment is active, use get_gcp_deployment_info for the intercept deployment group id the customer connects their VPC to and the live gateways.',
        productClause: (args) => {
            const management = args.managementSettings;
            const sources =
                management.type === 'smart-1-cloud'
                    ? ''
                    : `, management source CIDRs ${management.managementSourceCidrs ?? '(required by self-hosted management)'}`;
            return `${args.plan} plan, no throughput tier (GCP autoscales), ${management.type ?? 'self-hosted (backend default)'} management ${management.managementName}${sources}`;
        },
    }),
];
