import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running the 'show route' command that displays routing information.
 */
export class ShowRouteScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = [];
  
    /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("show_route does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "show_route";
    const script = "clish -c \"show route all\"";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'netstat -rn' command that displays routing table.
 */
export class NetstatRouteScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("netstat_route does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "netstat_route";
    const script = "netstat -rn";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'ip route show' command that displays IP routing information.
 */
export class IPRouteShowScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = [];

    /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("ip_route_show does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "ip_route_show";
    const script = "ip route show";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}
