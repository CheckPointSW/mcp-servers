import { z } from 'zod';
import { SECRET_KEY_PATTERN } from '../../secrets.js';
export { SECRET_KEY_PATTERN };

/** Deployment name, shared by every provider; the backend owns the format rules. */
export const deploymentNameSchema = z
    .string()
    .describe(
        'Deployment name, e.g. prod-eu-west: lowercase alphanumeric with single dashes, up to 30 characters for AWS or 63 for Azure and GCP; backend validates naming rules'
    );

export const descriptionSchema = z
    .string()
    .max(255)
    .optional()
    .describe('Free-text description shown alongside the deployment');

/** Copy of a backend value with secret-shaped keys removed at every depth. */
export function scrub(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
                .map(([key, nested]) => [key, scrub(nested)])
        );
    }
    return value;
}

/**
 * The AWS value the customer connects their network with, called out so it is
 * not lost among passthrough settings. Undefined for other clouds.
 */
export function awsConnection(deployment: {
    vendor?: unknown;
    vpcEndpointService?: string | null;
}): Record<string, string> | undefined {
    if (deployment.vendor !== 'aws') return undefined;
    return deployment.vpcEndpointService
        ? {
              gwlbEndpointServiceName: deployment.vpcEndpointService,
              use: 'The VPC endpoint service the customer creates their Gateway Load Balancer endpoint against. Give it to the user verbatim. When setup documentation is needed, use get_deployment_guide.',
          }
        : {
              unavailable:
                  'The backend has not returned the endpoint service name yet. Re-read deployment_status when another observation is needed.',
          };
}

/**
 * Deployment id, as it is interpolated into the request path. encodeURIComponent
 * does NOT encode dots, so a value like '.' or '..' survives and is collapsed by
 * WHATWG URL normalization inside fetch — retargeting the tenant-token request
 * at a sibling endpoint. Reject path metacharacters and all-dot segments here,
 * the same defense settings.ts applies to cpcfEnv.
 */
export const deploymentIdSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(
        /^(?!\.+$)[^/\\%]+$/,
        'must not be a dot segment or contain path separators'
    );
