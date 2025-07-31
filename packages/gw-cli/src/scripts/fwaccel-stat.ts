import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running 'fwaccel stat' command with optional parameters.
 */
export class FWAccelStatScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = ["param"];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    const param = params['param'];
    if (param !== undefined && param !== null) {
      // Only allow empty or no param for fwaccel_stat
      if (param.trim() !== '') {
        throw new Error(`fwaccel_stat does not accept parameters: ${param}`);
      }
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "fwaccel_stat";
    const baseCmd = "fwaccel stat";
    
    return [scriptName, baseCmd];
  }

  /**
   * Get the names of scripts managed by this class
   */
  static override scriptNames(): string[] {
    return ["fwaccel_stat"];
  }
}
