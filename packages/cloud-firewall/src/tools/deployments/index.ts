import type { AnyToolDef } from '../types.js';
import { deploymentReadTools } from './reads.js';
import { deploymentGuideTools } from './guide.js';
import { awsTools } from './aws/index.js';
import { azureTools } from './azure/index.js';
import { gcpTools } from './gcp/index.js';

/** Deployment reads, the public deployment guide, cloud deployment creation and Azure VNet peering. */
export const deploymentTools: AnyToolDef[] = [
    ...deploymentReadTools,
    ...deploymentGuideTools,
    ...awsTools,
    ...azureTools,
    ...gcpTools,
];
