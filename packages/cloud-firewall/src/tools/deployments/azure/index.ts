import { azureDeploymentTools } from './create.js';
import { azurePeeringTools } from './peerings.js';

export { azureCreateSchema } from './create.js';
export const azureTools = [...azureDeploymentTools, ...azurePeeringTools];
