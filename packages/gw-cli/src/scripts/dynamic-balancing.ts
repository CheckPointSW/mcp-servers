import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running the 'dynamic_balancing -p' command that shows the current state
 * of CoreXL Dynamic Balancing (enabled, disabled, started, or stopped).
 */
export class DynamicBalancingScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("dynamic_balancing does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "dynamic_balancing";
    const script = "dynamic_balancing -p";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }

  /**
   * Get the names of scripts managed by this class
   */
  static override scriptNames(): string[] {
    return ["dynamic_balancing"];
  }
}
