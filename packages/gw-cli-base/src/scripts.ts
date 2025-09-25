#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { APIManagerBase } from '@chkp/quantum-infra/src/api-manager.js';
import { SessionContext } from '@chkp/mcp-utils';

const GET_FILE_SCRIPT = 
  "if [ -f {output_file} ]; then " +
  'echo "Showing last {max_lines} lines of {output_file}:"; ' +
  "tail -n {max_lines} {output_file}; " +
  "else " +
  'echo "Output file not found."; ' +
  "fi";

/**
 * Base class for gateway CLI scripts
 */
export abstract class GWCLIScript {
  // Class properties for static members
  static mandatoryKeys: string[] = [];
  static optionalKeys: string[] = [];

  protected stopCalled: boolean = false;

  /**
   * Constructor for GWCLIScript
   */
  constructor(
    protected readonly mcp: McpServer,
    protected readonly apiManager: APIManagerBase,
    protected readonly targetGateway: string,
    protected readonly params: Record<string, any> = {}
  ) {
    // Validate targetGateway safety
    const [targetSafe, targetSafetyMessage] = GWCLIScript._isSafeString({ targetGateway });
    if (!targetSafe) {
      throw new Error(`Target gateway validation failed: ${targetSafetyMessage}`);
    }

    // Validate params safety
    const [paramsSafe, paramsSafetyMessage] = GWCLIScript._isSafeString(params);
    if (!paramsSafe) {
      throw new Error(`Parameters validation failed: ${paramsSafetyMessage}`);
    }

    // Run instance-specific input validation
    this.validateInputs(params);
  }

  /**
   * Validate that mandatory keys are provided in the parameters
   */
  static validateMandatoryKeys(params: Record<string, any>): [boolean, string] {
    const missingKeys = this.mandatoryKeys.filter(key => !(key in params));
    if (missingKeys.length > 0) {
      const message = `Missing mandatory keys: ${missingKeys.join(', ')}`;
      console.error(message);
      return [false, message];
    }
    return [true, ""];
  }

  /**
   * Validate input values (must be implemented by subclasses)
   */
  abstract validateInputs(params: Record<string, any>): void;
  
  /**
   * Validate input safety to prevent command injection
   */
  static _isSafeString(params: Record<string, any>): [boolean, string] {
    // Check each parameter for potential command injection
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Detect shell metacharacters and other potentially dangerous patterns
        if (/[;&|`$(){}[\]<>\\]/.test(value)) {
          return [false, `Parameter ${key} contains potentially unsafe characters`];
        }
      }
    }

    return [true, ""];
  }

  /**
   * Execute the script and return the result
   */
  async invoke(): Promise<string> {
    console.error(`Target gateway: ${this.targetGateway}`);
    const resp = await this._run();
    if (this.shouldClean()) {
      console.error("Cleaning up");
      await this.clean();
    }
    return JSON.stringify(resp, null, 2);
  }

  /**
   * Run the script implementation (to be implemented by subclasses)
   */
  protected abstract _run(): Promise<Record<string, any>>;

  /**
   * Get the names of scripts managed by this class
   */
  static scriptNames(): string[] {
    // Override in subclasses
    return [];
  }

  /**
   * Determine if cleanup should be performed
   */
  shouldClean(): boolean {
    return false;
  }

  /**
   * Convert a name to a safe filename format
   */
  static safeName(name: string): string {
    return name.replace(/ /g, '_').toLowerCase();
  }

  /**
   * Get the output file path for a script
   */
  static outputFile(scriptName: string): string {
    return `/var/run/mcp_${this.safeName(scriptName)}.out`;
  }

  static generateKillCommand(scriptType: string): string {
    const outputFile = this.outputFile(scriptType);
    const escapedFile = outputFile.replace(/(["\s'$`\\])/g,'\\$1'); // basic shell escaping
    const cmd = `ps -ef | grep '[${escapedFile.charAt(0)}]${escapedFile.slice(1)}' | awk '{print $2}' | xargs kill`;
    return cmd;
}

  /**
   * Run a script asynchronously
   */
  protected async runAsyncScript(
    scriptName: string,
    script: string
  ): Promise<[boolean, Record<string, any>]> {
    console.error(`Running async script: ${scriptName}`);
    return await this._runScript(scriptName, script, true);
  }

  /**
   * Run a script with the given parameters
   */
  protected async _runScript(
    scriptName: string,
    script: string,
    isAsync: boolean = false
  ): Promise<[boolean, Record<string, any>]> {
    const [success, tasks] = await this.apiManager.runScript(
      this.targetGateway,
      scriptName,
      script
    );
    
    if (!success) {
      console.error(`${scriptName} failed to run`);
      return [false, { message: "Failed to run the script" }];
    }
    
    console.error(`${scriptName} succeeded`);
    
    if (isAsync) {
      return [true, { message: `Started running the script ${scriptName}` }];
    }
    
    const [taskSuccess, taskOutput] = await this.apiManager.getTaskResult(this.targetGateway, tasks.tasks[0]);
    return [taskSuccess, {
      message: `Result for running the script ${scriptName}:\n${taskOutput}`
    }];
  }

  /**
   * Get the PID file path for a script
   */
  static pidFile(scriptName: string): string {
    return `/var/run/mcp_${this.safeName(scriptName)}.pid`;
  }

  /**
   * Stop all running scripts
   */
  async stopScripts(): Promise<void> {
    // Override in subclasses
    return;
  }

  /**
   * Clean up resources
   */
  async clean(): Promise<void> {
    for (const scriptType of (this.constructor as typeof GWCLIScript).scriptNames()) {
      const script = `rm -f ${(this.constructor as typeof GWCLIScript).outputFile(scriptType)}`;
      await this.apiManager.runScript(
        this.targetGateway,
        scriptType,
        script
      );
    }
  }

  /**
   * Get output from a script
   */
  async getScriptOutput(
    scriptName: string,
    isBase64: boolean = false,
    maxLines: number = 1000
  ): Promise<[boolean, string]> {
    let getFileScript: string;
    
    if (isBase64) {
      getFileScript = `base64 ${(this.constructor as typeof GWCLIScript).outputFile(scriptName)}`;
    } else {
      getFileScript = GET_FILE_SCRIPT
        .replace(/{output_file}/g, (this.constructor as typeof GWCLIScript).outputFile(scriptName))
        .replace(/{max_lines}/g, maxLines.toString());
    }
    
    const [success, tasks] = await this.apiManager.runScript(
      this.targetGateway,
      `output ${scriptName}`,
      getFileScript
    );
    
    if (!success) {
      return [false, "Failed to get the output"];
    }
    
    return await this.apiManager.getTaskResult(this.targetGateway,tasks.tasks[0]);
  }
}

/**
 * SimpleGWCLIScript is a simple implementation of the GWCLIScript class.
 * It runs a single script and returns the result.
 */
export class SimpleGWCLIScript extends GWCLIScript {
  /**
   * Validate input values (can be overridden by subclasses)
   */
  validateInputs(params: Record<string, any>): void {
    // Default implementation - can be overridden by subclasses
  }

  /**
   * Get the script to run (to be implemented by subclasses)
   */
  protected getScript(): [string, string] {
    // Override in subclasses to return [scriptName, script]
    return ["", ""];
  }

  /**
   * Run the script and return the result
   */
  protected async _run(): Promise<Record<string, any>> {
    const [scriptName, script] = this.getScript();
    
    if (!script) {
      return { message: "Failed to get the script" };
    }
    
    const [success, response] = await this._runScript(
      scriptName,
      script,
      false
    );
    
    if (!response) {
      return { message: "Failed to run the script" };
    }
    
    return response;
  }
}

// Helper function to run a script
export async function runScript<T extends GWCLIScript>(
  server: McpServer,
  scriptClass: new (mcp: McpServer, apiManager: any, targetGateway: string, params: Record<string, any>) => T,
  targetGateway: string,
  params: Record<string, any> = {},
  serverModule?: any,
  extra?: any): Promise<string> {
  try {
    // Validate mandatory keys
    const mandatoryKeys = (scriptClass as any).mandatoryKeys || [];
    const missingKeys = mandatoryKeys.filter((key: string) => !(key in params));
    if (missingKeys.length > 0) {
      const message = `Missing mandatory key(s): ${missingKeys.join(', ')}`;
      console.error(message);
      return message;
    }

    // Check for unexpected parameters
    const allowedKeys = [
      ...(scriptClass as any).mandatoryKeys || [],
      ...(scriptClass as any).optionalKeys || [],
    ];

    const unexpected = Object.keys(params).filter(key => !allowedKeys.includes(key));
    if (unexpected.length > 0) {
      const errorMsg = `Unexpected parameter(s): ${unexpected.join(', ')}`;
      console.error(errorMsg);
      return errorMsg;
    }

    // Get the API manager from the session context if serverModule is provided,
    // otherwise fall back to the old method (for backward compatibility)
    let apiManager;
    if (serverModule) {
      apiManager = SessionContext.getAPIManager(serverModule, extra);
    } else {
      // Fallback for old usage pattern
      throw new Error('ServerModule is required for multi-user support');
    }
    
    const script = new scriptClass(server, apiManager, targetGateway, params);

    // Invoke the script
    return await script.invoke();
  } catch (error) {
    const errorMsg = `Failed to run script: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    return errorMsg;
  }
}
