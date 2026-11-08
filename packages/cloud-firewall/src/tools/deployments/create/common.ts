import { baseProfile } from './profiles/base.js';
import { cpProductProfile } from './profiles/cp-product.js';
import { cpManagementProfile } from './profiles/cp-management.js';

/**
 * The create contract AWS shares with other Check Point-product clouds
 * (Azure), composed from profiles.
 *
 * This file used to hold "the vendor-neutral half of every create contract"
 * inline. Against more than one real backend contract that stopped being
 * true — a cloud can share only the deployment name and diverge on
 * everything else (sizing fields, management shape). So the pieces live in
 * profiles/ and a cloud composes the ones it needs:
 *
 *   profiles/base.ts            name, description        — every cloud
 *   profiles/cp-product.ts      throughput, plan, version — AWS, Azure
 *   profiles/cp-management.ts   type, sicPassword, IPs    — AWS, Azure
 *   profiles/gcp-management.ts  type, sicKey, source CIDRs — GCP only; composed
 *                               by gcp/create.ts, not by this file
 *
 * The exports below are kept at their original names and shapes so the
 * clouds that compose them need no edit. A cloud that genuinely diverges
 * composes profiles directly instead of overriding these.
 */

export { managementSettingsSchema } from './profiles/cp-management.js';
export { cpProductClause } from './profiles/cp-product.js';

/** Fields shared by throughput-billed create schemas; add `vendorSettings`. */
export const commonCreateSchema = {
    ...baseProfile.schema,
    ...cpProductProfile.schema,
    ...cpManagementProfile.schema,
};
