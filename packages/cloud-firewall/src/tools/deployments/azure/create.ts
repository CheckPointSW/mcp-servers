import { z } from 'zod';
import type { AnyToolDef } from '../../types.js';
import { baseProfile } from '../create/profiles/base.js';
import {
    cpProductProfile,
    cpProductClause,
} from '../create/profiles/cp-product.js';
import { managementSettingsSchema } from '../create/profiles/cp-management.js';
import { makeCreateDeploymentTool } from '../create/factory.js';
import { whenOmitted } from '../create/effective-config.js';

// Azure shares product/SIC fields with AWS, but has no enableCme create field.
export const azureManagementSettingsSchema = managementSettingsSchema
    .omit({
        enableCme: true,
    })
    .extend({
        // Re-described, so its omission is re-declared: Azure's backend has
        // no 'MGMT' default for this field.
        managementName: whenOmitted(
            managementSettingsSchema.shape.managementName.describe(
                'Optional external management object name.'
            ),
            { source: 'not-set' }
        ),
    });
const topLevelSchema = {
    ...baseProfile.schema,
    ...cpProductProfile.schema,
    managementSettings: azureManagementSettingsSchema,
};
const vendorSettingsSchema = z.object({
    region: z
        .string()
        .min(1)
        .describe(
            'Azure region, e.g. westeurope; backend validates supported regions'
        ),
    customerAzureTenantId: z
        .string()
        .min(1)
        .describe(
            'Customer Azure tenant ID, required for deployment with no backend default. Reuse a supplied confirmed tenant; otherwise discover it through the selected authenticated Azure MCP or CLI connection and confirm it with the user. The backend validates the directory identifier.'
        ),
    customerSubscriptionIds: whenOmitted(
        z
            .array(z.string().min(1))
            .optional()
            .describe(
                'Optional customer subscription IDs. Reuse supplied confirmed subscriptions; otherwise resolve the target through the selected authenticated Azure MCP or CLI connection. List subscription alternatives only on request and confirm the intended ones.'
            ),
        { source: 'not-set' }
    ),
    vnetAddressSpace: z
        .string()
        .min(1)
        .describe(
            'Security VNet network-address IPv4 CIDR, e.g. 10.10.0.0/16; backend validates supported prefixes and address ranges'
        ),
    customerVnetCidrs: z
        .array(z.string().min(1))
        .min(1)
        .describe(
            'Address ranges of the customer workload VNets to protect, required for deployment. Backend validates supported CIDRs.'
        ),
});
export const azureCreateSchema = z.object({
    ...topLevelSchema,
    vendorSettings: vendorSettingsSchema,
});
export const azureDeploymentTools: AnyToolDef[] = [
    makeCreateDeploymentTool({
        vendor: 'azure',
        vendorLabel: 'Azure',
        discoveryGuidance:
            'Azure: follow the shared deployment intake flow; reuse confirmed target inputs and the selected MCP connection or CLI context. If disconnected, offer connection through an available Azure operations MCP or CLI, or accept supplied tenant/subscription and region for manual intake. If coverage gaps are relevant to the user’s goal, offer optional network discovery through available Azure tools. Do not enumerate subscriptions or local contexts by default; show a short relevant unnumbered rendered table with Name, Subscription ID and Tenant ID only when the user requests alternatives. Discover unresolved target resources read-only through the confirmed connection. For CLI resource reads, pass subscription explicitly; never change defaults. On auth failure, explain and offer authorized reauthentication while preserving user/service-principal/managed-identity authentication. Show VNet/CIDR candidates and reuse confirmed customerVnetCidrs. Propose a private security CIDR candidate, check known overlaps and ask about connected ranges. Disclose unchecked ranges and include the proposed CIDR in the preview.',
        topLevelSchema,
        vendorSettingsSchema,
        vendorClause: (vs) =>
            `in ${vs.region} with security VNet ${vs.vnetAddressSpace}, customer tenant ${vs.customerAzureTenantId || '(required)'}, allowed customer VNet CIDRs ${Array.isArray(vs.customerVnetCidrs) && vs.customerVnetCidrs.length ? vs.customerVnetCidrs.join(', ') : '(required)'}, subscriptions ${Array.isArray(vs.customerSubscriptionIds) && vs.customerSubscriptionIds.length ? vs.customerSubscriptionIds.join(', ') : '(backend workflow)'}`,
        productClause: cpProductClause,
        postCreateGuidance:
            'If connectivity setup is in scope after provisioning, inspect peering records with get_azure_vnet_peerings. An empty result does not prove connectivity is absent. If peerings are needed, reuse confirmed workload VNets or discover candidates, then preview add_azure_vnet_peerings and obtain approval before submitting.',
    }),
];
