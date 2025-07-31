import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running the 'dmidecode' command that displays hardware information.
 */
export class DmidecodeScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  /**
   * Get the script to run
   */

  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("dmidecode does not accept parameters");
    }
  }

  protected override getScript(): [string, string] {
    const scriptName = "dmidecode";
    const script = "dmidecode";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'show asset all' command that displays asset information.
 */
export class ShowAssetAllScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = [];

    /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("show_asset_all does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "show_asset_all";
    const script = "clish -c \"show asset all\"";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'cpinfo -y all' command that displays system information.
 */
export class CPInfoAllScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("cpinfo_all does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "cpinfo_all";
    const script = "cpinfo -y all";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}
