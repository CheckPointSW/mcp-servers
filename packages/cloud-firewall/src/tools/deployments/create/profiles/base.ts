import { defineProfile } from './types.js';
import { deploymentNameSchema, descriptionSchema } from '../../shared.js';
import { whenOmitted } from '../effective-config.js';

/**
 * The only genuinely universal part of a create contract: what the deployment
 * is called.
 *
 * Everything else that once lived in "the vendor-neutral half" turned out to
 * be a Check Point-product decision (see cp-product.ts) or a Check Point
 * management decision (see cp-management.ts), not something every cloud's
 * backend contract shares. Keeping this file this small is the point: a cloud
 * that shares only the name should have to compose only the name.
 *
 * `description` is schema-only by design. It is optional and free text, so
 * the backend accepts it without further decisions.
 */
export const baseProfile = defineProfile({
    schema: {
        name: deploymentNameSchema,
        description: whenOmitted(descriptionSchema, { source: 'not-set' }),
    },
});
