import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running the 'hcp -r "Protections Impact"' command that runs
 * Health Tool to check Protections Impact.
 */
export class HCPProtectInfoScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== null && params['param'] !== '') {
      throw new Error("hcp_protect_info does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "hcp_protect_info";
    const script = 'hcp -r "Protections Impact"';
    
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }

  /**
   * Get the names of scripts managed by this class
   */
  static override scriptNames(): string[] {
    return ["hcp_protect_info"];
  }
}
