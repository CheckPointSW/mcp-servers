import { SimpleGWCLIScript } from '@chkp/quantum-gw-cli-base';

/**
 * Base class for FWCtl scripts
 */
abstract class FWCtlScript extends SimpleGWCLIScript {
  static override optionalKeys: string[] = ["param"];
  protected abstract command: string;

  protected override getScript(): [string, string] {
    const scriptName = this.command.replace(/\s+/g, '_');
    let script = `fw ctl ${this.command}`;
    
    const param = this.params['param'] as string | undefined;
    if (param) {
      script = `${script} ${param}`;
    }
    
    console.error(`Running command: ${script}`);
    return [scriptName, script];
  }
}

/**
 * Shows the configured Proxy ARP entries based on the $FWDIR/conf/local.arp file on the Security Gateway.
 */
export class FWCtlArpScript extends FWCtlScript {
  protected command: string = "arp";
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("fw_ctl_arp does not accept parameters");
    }
  }

  static override scriptNames(): string[] {
    return ["fw_ctl_arp"];
  }
}

/**
 * Shows the list of Firewall Chain Modules.
 */
export class FWCtlChainScript extends FWCtlScript {
  protected command: string = "chain";
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("fw_ctl_chain does not accept parameters");
    }
  }

  static override scriptNames(): string[] {
    return ["fw_ctl_chain"];
  }
}

/**
 * Shows the list of Firewall Connection Modules.
 */
export class FWCtlConnScript extends FWCtlScript {
  protected command: string = "conn";
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("fw_ctl_conn does not accept parameters");
    }
  }

  static override scriptNames(): string[] {
    return ["fw_ctl_conn"];
  }
}

/**
 * Generates statistics report about Check Point Active Streaming (CPAS).
 */
export class FWCtlCPASStatScript extends FWCtlScript {
  protected command: string = "cpasstat";
  
  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("fw_ctl_cpasstat does not accept parameters");
    }
  }

  static override scriptNames(): string[] {
    return ["fw_ctl_cpasstat"];
  }
}

/**
 * Generates statistics report about Data Loss Prevention kernel module.
 */
export class FWCtlDLPKStatScript extends FWCtlScript {
  protected command: string = "dlpkstat";

  /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("fw_ctl_dlpkstat does not accept parameters");
    }
  }


  static override scriptNames(): string[] {
    return ["fw_ctl_dlpkstat"];
  }
}

/**
 * Shows the list of interfaces to which the Check Point Firewall kernel attached.
 */
export class FWCtlIfListScript extends FWCtlScript {
  protected command: string = "iflist";

    /**
   * Validate input values 
   */
  override validateInputs(params: Record<string, any>): void {
    // No params expected
    if (params['param'] !== undefined && params['param'] !== '') {
      throw new Error("fw_ctl_iflist does not accept parameters");
    }
  }

  static override scriptNames(): string[] {
    return ["fw_ctl_iflist"];
  }
}

/**
 * Shows Security Gateway various internal statistics.
 */
export class FWCtlPStatScript extends FWCtlScript {
  protected command: string = "pstat";
  
  static override scriptNames(): string[] {
    return ["fw_ctl_pstat"];
  }

  override validateInputs(params: Record<string, any>): void {
    const param = params['param'];
    if (param !== undefined && param !== null) {
      // Only allow valid flags: -c, -h, -k, -l, -m, -o, -s, -v 4, -v 6 (optionally separated by spaces)
      const regex = /^(?:-(?:[chklsmo])\s*|-v\s*[46]\s*)*$/
      if (!regex.test(param.trim())) {
        throw new Error(`Invalid param value for fwaccel_stats: ${param}`);
      }
    }
  }

}

/**
 * Generates statistics report about TCP Streaming.
 */
export class FWCtlTCPStrStatScript extends FWCtlScript {
  protected command: string = "tcpstrstat";
  
  static override scriptNames(): string[] {
    return ["fw_ctl_tcpstrstat"];
  }

    override validateInputs(params: Record<string, any>): void {
    const param = params['param'];
    if (param !== undefined && param !== null) {
      // Only allow valid flag: -p
      const regex = /^(?:-p\s?)+$/;
      if (!regex.test(param.trim())) {
        throw new Error(`Invalid param value for fwaccel_stats: ${param}`);
      }
    }
  }

}
