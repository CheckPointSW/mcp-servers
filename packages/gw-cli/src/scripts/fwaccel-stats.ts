import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

const VALID_PARAMS = ["-c", "-d", "-l", "-m", "-n", "-o", "-p", "-q", "-r", "-s", "-x"];

/**
 * Script for running 'fwaccel stats' command with optional parameters.
 * Valid parameters:
 * -c: Shows the statistics for ClusterClosed Correction.
 * -d: Shows the statistics for drops from device.
 * -l: Shows the statistics in legacy mode - as one table.
 * -m: Shows the statistics for multicast traffic.
 * -n: Shows the statistics for Identity AwarenessClosed (NAC).
 * -o: Shows the statistics for Reorder Infrastructure.
 * -p: Shows the statistics for SecureXLClosed violations (F2FClosed packets).
 * -q: Shows the statistics notifications the SecureXL sent to the Firewall.
 * -s: Shows the statistics summary only.
 * -x: Shows the statistics for PXL.
 */
export class FWAccelStatsScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = ["ipv6", "param"];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    const param = params['param'];
    if (param !== undefined && param !== null) {
      // Only allow valid flags: -c, -d, -l, -m, -n, -o, -p, -q, -s, -x (optionally separated by spaces)
      const regex = /^(?:-[cdlmnopqsx](?:\s)?)*$/;
      if (!regex.test(param.trim())) {
        throw new Error(`Invalid param value for fwaccel_stats: ${param}`);
      }
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "fwaccel_stats";

    const ipv6 = Boolean(this.params['ipv6']);    
    const baseCmd = `fwaccel${ipv6 ? '6' : ''} stats`;
  
    const param = this.params['param'] as string | undefined;
    let script: string;
    
    if (param && VALID_PARAMS.includes(param)) {
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
    return ["fwaccel_stats"];
  }
}
