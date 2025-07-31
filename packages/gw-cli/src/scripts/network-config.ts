import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Script for running the 'show vlan all' command that displays VLAN configuration.
 */
export class ShowVlanAllScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = ['param'];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // Optional parameter validation
    if (params['param'] !== undefined && typeof params['param'] !== 'string') {
      throw new Error("param must be a string");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "show_vlan_all";
    const param = this.params['param'] || '';
    const script = param ? `show vlan ${param}` : "show vlan all";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'show interface extended' command that displays interface configuration.
 */
export class ShowInterfacesAllScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = [];
  static override optionalKeys: string[] = [];
  
    /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("show_interfaces_all does not accept parameters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "show_interfaces_all";
    const script = "clish -c \"show interfaces all\"";
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Script for running the 'show interface <interface_name>' command that displays specific interface configuration.
 */
export class ShowInterfaceScript extends SimpleGWCLIScript {
  // Class properties for static members
  static override mandatoryKeys: string[] = ['interface_name'];
  static override optionalKeys: string[] = [];
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // Mandatory parameter validation
    if (!params['interface_name'] || typeof params['interface_name'] !== 'string') {
      throw new Error("interface_name must be provided as a string");
    }
    
    // Basic interface name validation
    const interfaceName = params['interface_name'];
    if (!/^[a-zA-Z0-9\-_\.\/]+$/.test(interfaceName)) {
      throw new Error("interface_name contains invalid characters");
    }
  }

  /**
   * Get the script to run
   */
  protected override getScript(): [string, string] {
    const scriptName = "show_interface_specific";
    const interfaceName = this.params['interface_name'];
    const script = `clish -c "show interface ${interfaceName}"`;
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}
