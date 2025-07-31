import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running 'fwaccel conns' command with optional parameters.
 * The fwaccel conns command shows the list of SecureXL connections on the local Security Gateway or Cluster Member.
 * 
 * Optional parameter (param):
 *   -h : Shows the applicable built-in help.
 *   -i <SecureXL ID> : Specifies the SecureXL instance ID (for IPv4 only).
 *   -f <Filter> : Show the SecureXL Connections Table entries based on the specified filter flags.
 *   -m <Number of Entries> : Specifies the maximal number of connections to show.
 *   -s : Shows the summary of SecureXL Connections Table (number of connections).
 * You can combine parameters as a single string, e.g. '-s -m 10'.
 */
export class FWAccelConnsScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = ["ipv6", "param"];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    const param = params['param'];
    if (param !== undefined && param !== null && param.trim() !== '') {
      // Forbid dangerous shell characters
      if (/[|&;><$`\\]/.test(param)) {
        throw new Error('Invalid or dangerous characters detected in fwaccel_conns parameters.');
      }

      // Allowed filter flags for -f
      const allowedFilterFlags = 'AaCcFfHhLlNnQqSsUu';
      // Tokenize: match flags and their arguments
      const tokens = param.match(/-\w+|[^\s]+/g) || [];
      let i = 0;
      while (i < tokens.length) {
        const token = tokens[i];
        if (token === '-h' || token === '-s') {
          i += 1;
          continue;
        }
        if (token === '-i' || token === '-m') {
          // Must be followed by a number
          if (i + 1 >= tokens.length || !/^\d+$/.test(tokens[i + 1])) {
            throw new Error(`Flag ${token} must be followed by a number in fwaccel_conns: ${param}`);
          }
          i += 2;
          continue;
        }
        if (token === '-f') {
          // Must be followed by a non-empty string of only allowed filter flags
          if (
            i + 1 >= tokens.length ||
            !new RegExp(`^[${allowedFilterFlags}]+$`).test(tokens[i + 1])
          ) {
            throw new Error(`Flag -f must be followed by valid filter flags (AaCcFfHhLlNnQqSsUu) in fwaccel_conns: ${param}`);
          }
          i += 2;
          continue;
        }
        throw new Error(`Invalid flag for fwaccel_conns: ${token}`);
      }
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "fwaccel_conns";

    const ipv6 = Boolean(this.params['ipv6']);    
    const baseCmd = `fwaccel${ipv6 ? '6' : ''} conns`;

    const param = this.params['param'] as string | undefined;
    let script: string;
    
    if (param) {
      script = `${baseCmd} ${param}`;
    } else {
      script = baseCmd;
    }
    
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }

  /**
   * Get the names of scripts managed by this class
   */
  static override scriptNames(): string[] {
    return ["fwaccel_conns"];
  }
}
