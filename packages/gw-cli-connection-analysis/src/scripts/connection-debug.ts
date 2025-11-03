import { GWCLIScript } from '@chkp/quantum-gw-cli-base';

// Debug script constants
const FW_DEBUG_SCRIPT = `fw ctl debug 0; 
fw ctl debug -buf 8200; 
fw ctl debug -F {filter_flags}; 
fwaccel dbg -m pkt all; 
fw ctl debug -m fw + drop; 
nohup fw ctl kdebug -m 1 -f -o {output_file} > /dev/null 2>&1 &`;

const FW_MONITOR_SCRIPT = 'fw monitor -e "{filter_flags}, accept;" -o {output_file}';

const FW_TAB_CONNECTION_SCRIPT = `nohup sh -c 'for i in $(seq 1 3600); do fw tab -t connections -u -f | {filter_flags} >> {output_file}; sleep 1; done' >/dev/null 2>&1 &`;

const SCRIPT_RESULTS_PREFIX = `I have run the following debug scripts on the gateway: {scripts}. The output is presented below:
In your analysis, explain what is the issue, what caused it, and how to fix it.
You must:
Explain how you got to each conclusion.
Give a log line example (or several lines) that leads you to draw this conclusion.
Offer ways to further investigate and / or fix the issues.

{results}`;

// Enum for FW Debug Script types
enum FWDebugScript {
  FW_DEBUG = "fw_debug",
  DEBUG_MONITOR = "debug_monitor",
  TAB_CONNECTIONS = "tab_connections"
}

/**
 * Base class for connection debug scripts
 */
abstract class ConnectionDebugScript extends GWCLIScript {
  static override mandatoryKeys: string[] = ['source_ip', 'destination_ip'];
  
  protected get sourceIp(): string {
    return this.params['source_ip'] as string;
  }
  
  protected get destinationIp(): string {
    return this.params['destination_ip'] as string;
  }
  
  override validateInputs(params: Record<string, any>): void {
    // Validate IP addresses with a simple regex
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (!ipRegex.test(params['source_ip'])) {
      throw new Error(`Invalid source IP address: ${params['source_ip']}`);
    }
    
    if (!ipRegex.test(params['destination_ip'])) {
      throw new Error(`Invalid destination IP address: ${params['destination_ip']}`);
    }
  }
  
  static override scriptNames(): string[] {
    return [FWDebugScript.FW_DEBUG, FWDebugScript.TAB_CONNECTIONS];
  }
    
  override shouldClean(): boolean {
    return this.stopCalled;
  }
  
  async stopScripts(): Promise<void> {
    this.stopCalled = true;
    for (const scriptType of (this.constructor as typeof ConnectionDebugScript).scriptNames()) {
      let script: string;
      
      switch (scriptType) {
        case FWDebugScript.FW_DEBUG:
          script = "fw ctl debug 0";
          break;
        case FWDebugScript.DEBUG_MONITOR:
          script = "fw monitor -U";
          break;
        default:
          script =GWCLIScript.generateKillCommand(scriptType);
          break;
      }
      
      await this.apiManager.runScript(
        this.targetGateway,
        `stop ${scriptType}`,
        script
      );
    }
  }
}

/**
 * Script to start connection debug analysis on a gateway
 */
export class StartConnectionDebugScript extends ConnectionDebugScript {
  /**
   * Build filter flags for fw debug script
   */
  private static buildFwDebugScriptFilters(filters: string[]): string {
    const filterFlags = ["0", "0", "0", "0", "0"];
    if (filters.length > 0) {
      filterFlags[0] = filters[0];
      if (filters.length > 1) {
        filterFlags[2] = filters[1];
      }
    }
    return filterFlags.join(",");
  }

  /**
   * Build filter flags for fw monitor script
   */
  private static buildFwMonitorScriptFilters(filters: string[]): string {
    if (filters.length === 0) {
      return "";
    } else if (filters.length === 1) {
      return `host(${filters[0]})`;
    } else {
      const srcIp = filters[0];
      const dstIp = filters[1];
      return `((src=${srcIp} , dst=${dstIp}) or (src=${dstIp} , dst=${srcIp}))`;
    }
  }

  /**
   * Build filter flags for fw tab connections script
   */
  private static buildFwTabConnectionScriptFilters(filters: string[]): string {
    const greps = filters.map(filter => `grep -E '${filter}'`);
    return greps.join(' | ');
  }

  /**
   * Get debug script with proper filter flags
   */
  private static getDebugScript(scriptType: string, debugFilters: string[], outputFile: string): string | null {
    let script: string;
    let filterFlags: string;

    switch (scriptType) {
      case FWDebugScript.FW_DEBUG:
        script = FW_DEBUG_SCRIPT;
        filterFlags = this.buildFwDebugScriptFilters(debugFilters);
        break;
        
      case FWDebugScript.DEBUG_MONITOR:
        script = FW_MONITOR_SCRIPT;
        filterFlags = this.buildFwMonitorScriptFilters(debugFilters);
        break;
        
      case FWDebugScript.TAB_CONNECTIONS:
        script = FW_TAB_CONNECTION_SCRIPT;
        filterFlags = this.buildFwTabConnectionScriptFilters(debugFilters);
        break;
        
      default:
        return null;
    }

    let finalScript = script
      .replace(/{output_file}/g, outputFile)
      .replace(/{filter_flags}/g, filterFlags);
    
    // // For background processes, also replace the PID file placeholder
    // if (scriptType === FWDebugScript.TAB_CONNECTIONS) {
    //   const pidFile = GWCLIScript.pidFile(scriptType);
    //   finalScript = finalScript.replace(/{pid_file}/g, pidFile);
    // }
    
    return finalScript;
  }


  protected override async _run(): Promise<Record<string, any>> {
    const sourceIP = this.sourceIp;
    const destIP = this.destinationIp;
    
    // Debug filters are the source and destination IPs
    const debugFilters = [sourceIP, destIP];
    
    // Iterate over script names and run each one
    for (const scriptType of (this.constructor as typeof ConnectionDebugScript).scriptNames()) {
      const script = StartConnectionDebugScript.getDebugScript(
        scriptType, 
        debugFilters, 
        GWCLIScript.outputFile(scriptType)
      );
      
      if (!script) {
        return { message: `Failed to get the ${scriptType} script` };
      }
      
      const [success, tasks] = await this.apiManager.runScript(
        this.targetGateway,
        scriptType,
        script
      );
      
      if (!success) {
        await this.stopScripts();
        return { message: `Failed to start ${scriptType} script` };
      }
    }
    
    return {
      message: `I have started running the debug scripts on the gateway ${this.targetGateway}. Please reproduce the issue and let me know when you are done`
    };
  }
}

/**
 * Script to stop connection debug analysis and retrieve results
 */
export class StopConnectionDebugScript extends ConnectionDebugScript {
  protected override async _run(): Promise<Record<string, any>> {
    const sourceIP = this.sourceIp;
    const destIP = this.destinationIp;
    const results: string[] = [];
    const scriptsRun: string[] = [];
    
    // First stop all running scripts
    await this.stopScripts();
    
    // Then collect results from each script type
    for (const scriptType of (this.constructor as typeof ConnectionDebugScript).scriptNames()) {
      const outputFile = GWCLIScript.outputFile(scriptType)
      
      const getResultScript = `if [ -f ${outputFile} ]; then
        echo "=== ${scriptType.toUpperCase()} RESULTS ===";
        cat ${outputFile};
        rm -f ${outputFile};
        echo "";
      else
        echo "No ${scriptType} results found for connection between ${sourceIP} and ${destIP}";
      fi`;
      
      const [resultSuccess, tasks] = await this.apiManager.runScript(
        this.targetGateway,
        `get_${scriptType}_results`,
        getResultScript
      );
      
      if (resultSuccess) {
        const [taskSuccess, taskOutput] = await this.apiManager.getTaskResult(this.targetGateway, tasks.tasks[0]);
        results.push(taskOutput);
        scriptsRun.push(scriptType);
      } else {
        results.push(`Failed to get ${scriptType} results`);
      }
    }
    
    const allResults = results.join('\n');
    const formattedResults = SCRIPT_RESULTS_PREFIX
      .replace(/{scripts}/g, scriptsRun.join(', '))
      .replace(/{results}/g, allResults);
    
    return {
      message: `Connection debug results for ${sourceIP} to ${destIP}`,
      output: formattedResults
    };
  }
}
