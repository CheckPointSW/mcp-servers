import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running the 'cphaprob stat' command that displays cluster status.
 */
export class CPHAProbStatScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "cphaprob_stat";
    const script = "cphaprob stat";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'cphaprob -a if' command that displays interface status.
 */
export class CPHAProbIfScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("cphaprob_if does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "cphaprob_if";
    const script = "cphaprob -a if";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'cphaprob syncstat' command that displays sync status.
 */
export class CPHAProbSyncStatScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "cphaprob_syncstat";
    const script = "cphaprob syncstat";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}


