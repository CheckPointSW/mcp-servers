#!/usr/bin/env node
const url = require("url");
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/management/dist/index.js
var index_exports = {};
__export(index_exports, {
  server: () => server
});
module.exports = __toCommonJS(index_exports);
var import_http = require("http");
var import_url = require("url");
var import_child_process = require("child_process");
var import_util = require("util");
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_zod = require("zod");
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_axios = __toESM(require("axios"), 1);
var import_https = __toESM(require("https"), 1);
var import_commander = require("commander");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_streamableHttp = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
var import_fs = __toESM(require("fs"), 1);
var import_http2 = __toESM(require("http"), 1);
var import_crypto = require("crypto");
var import_axios2 = __toESM(require("axios"), 1);
var import_fs2 = require("fs");
var import_path = require("path");
var import_url2 = require("url");
var import_meta = {};
var __defProp2 = Object.defineProperty;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
};
var __export2 = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
var ui_dialog_exports = {};
__export2(ui_dialog_exports, {
  showDialog: () => showDialog,
  showLoginDialog: () => showLoginDialog
});
async function showDialog(config) {
  const dialog = new UIDialog();
  return dialog.showDialog(config);
}
async function showLoginDialog(title, message) {
  return showDialog({
    title: title || "Login Information",
    message,
    fields: [
      {
        name: "address",
        label: "Address",
        type: "text",
        placeholder: "Enter server address...",
        required: true
      },
      {
        name: "user",
        label: "Username",
        type: "text",
        placeholder: "Enter username...",
        required: true
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        placeholder: "Enter password...",
        required: true
      }
    ]
  });
}
var execAsync;
var UIDialog;
var init_ui_dialog = __esm({
  "../mcp-utils/dist/ui-dialog.js"() {
    "use strict";
    execAsync = (0, import_util.promisify)(import_child_process.exec);
    UIDialog = class {
      constructor() {
        this.server = null;
        this.port = 0;
        this.resolve = null;
      }
      async showDialog(config) {
        return new Promise((resolve, reject) => {
          this.resolve = resolve;
          this.server = (0, import_http.createServer)((req, res) => {
            this.handleRequest(req, res, config);
          });
          this.server.listen(0, "localhost", () => {
            const address = this.server.address();
            if (address && typeof address === "object") {
              this.port = address.port;
              this.openBrowser(`http://localhost:${this.port}`);
            } else {
              reject(new Error("Failed to start server"));
            }
          });
          setTimeout(() => {
            this.cleanup();
            resolve({ cancelled: true, data: {} });
          }, 5 * 60 * 1e3);
        });
      }
      handleRequest(req, res, config) {
        const url = new import_url.URL(req.url, `http://localhost:${this.port}`);
        if (req.method === "GET" && url.pathname === "/") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(this.generateHTML(config));
        } else if (req.method === "POST" && url.pathname === "/submit") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            const formData = new URLSearchParams(body);
            const result = {};
            for (const field of config.fields) {
              result[field.name] = formData.get(field.name) || "";
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
          <html>
            <head><title>Success</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>Form submitted successfully!</h2>
              <p>You can close this window now.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);
            this.cleanup();
            if (this.resolve) {
              this.resolve({ cancelled: false, data: result });
            }
          });
        } else if (req.method === "POST" && url.pathname === "/cancel") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
        <html>
          <head><title>Cancelled</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>Form cancelled</h2>
            <p>You can close this window now.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
        </html>
      `);
          this.cleanup();
          if (this.resolve) {
            this.resolve({ cancelled: true, data: {} });
          }
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      }
      generateHTML(config) {
        const fieldsHTML = config.fields.map((field) => {
          let fieldHTML = "";
          const fieldType = field.type || "text";
          switch (fieldType) {
            case "textarea":
              fieldHTML = `
            <textarea 
              name="${field.name}" 
              placeholder="${field.placeholder || ""}"
              ${field.required ? "required" : ""}
              style="width: 100%; box-sizing: border-box; min-height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial, sans-serif; font-size: 14px; resize: vertical;"
            >${field.defaultValue || ""}</textarea>
          `;
              break;
            case "select":
              fieldHTML = `
            <select 
              name="${field.name}" 
              ${field.required ? "required" : ""}
              style="width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial, sans-serif; font-size: 14px;"
            >
              <option value="">Select an option...</option>
              ${(field.options || []).map((option) => `<option value="${option}" ${option === field.defaultValue ? "selected" : ""}>${option}</option>`).join("")}
            </select>
          `;
              break;
            default:
              fieldHTML = `
            <input 
              type="${fieldType}" 
              name="${field.name}" 
              placeholder="${field.placeholder || ""}"
              value="${field.defaultValue || ""}"
              ${field.required ? "required" : ""}
              style="width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial, sans-serif; font-size: 14px;"
            />
          `;
          }
          return `
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">
            ${field.label}${field.required ? " *" : ""}
          </label>
          ${fieldHTML}
        </div>
      `;
        }).join("");
        return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${config.title}</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              max-width: 500px;
              margin: 50px auto;
              padding: 20px;
              background-color: #f5f5f5;
              line-height: 1.4;
            }
            .dialog {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .buttons {
              margin-top: 20px;
              text-align: right;
            }
            button {
              padding: 10px 20px;
              margin-left: 10px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              font-family: Arial, sans-serif;
            }
            .submit-btn {
              background-color: #007cba;
              color: white;
            }
            .submit-btn:hover {
              background-color: #005a87;
            }
            .cancel-btn {
              background-color: #6c757d;
              color: white;
            }
            .cancel-btn:hover {
              background-color: #545b62;
            }
            input:focus, textarea:focus, select:focus {
              outline: none;
              border-color: #007cba;
              box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
            }
          </style>
        </head>
        <body>
          <div class="dialog">
            <h2 style="margin-top: 0; color: #333;">${config.title}</h2>
            ${config.message ? `<p style="color: #666; margin-bottom: 20px;">${config.message}</p>` : ""}
            
            <form id="dialogForm" method="POST" action="/submit">
              ${fieldsHTML}
              
              <div class="buttons">
                <button type="button" class="cancel-btn" onclick="cancel()">
                  ${config.cancelButtonText || "Cancel"}
                </button>
                <button type="submit" class="submit-btn">
                  ${config.submitButtonText || "Submit"}
                </button>
              </div>
            </form>
          </div>

          <script>
            function cancel() {
              fetch('/cancel', { method: 'POST' })
                .then(() => {
                  document.body.innerHTML = '<div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;"><h2>Cancelled</h2><p>You can close this window now.</p></div>';
                  setTimeout(() => window.close(), 2000);
                });
            }

            // Auto-focus first input
            document.addEventListener('DOMContentLoaded', () => {
              const firstInput = document.querySelector('input, textarea, select');
              if (firstInput) {
                firstInput.focus();
                // If it's a text input, place cursor at end
                if (firstInput.type === 'text' || firstInput.tagName === 'TEXTAREA') {
                  const val = firstInput.value;
                  firstInput.value = '';
                  firstInput.value = val;
                }
              }
            });

            // Prevent form submission if required fields are empty
            document.getElementById('dialogForm').addEventListener('submit', function(e) {
              const requiredFields = document.querySelectorAll('[required]');
              for (let field of requiredFields) {
                if (!field.value.trim()) {
                  e.preventDefault();
                  field.focus();
                  alert('Please fill in all required fields.');
                  return false;
                }
              }
            });
          </script>
        </body>
      </html>
    `;
      }
      async openBrowser(urlString) {
        try {
          let url;
          try {
            url = new import_url.URL(urlString);
            if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
              throw new Error("Invalid URL protocol or non-localhost hostname");
            }
          } catch (e) {
            console.error("Invalid URL:", e);
            return;
          }
          switch (process.platform) {
            case "darwin": {
              const scriptPath = path.join(process.env.TMPDIR || "/tmp", `open-browser-${Date.now()}.applescript`);
              const script = `open location "${urlString}"`;
              fs2.writeFileSync(scriptPath, script);
              await execAsync(`osascript "${scriptPath}"`);
              try {
                fs2.unlinkSync(scriptPath);
              } catch (e) {
              }
              break;
            }
            case "win32": {
              await execAsync(`rundll32 url.dll,FileProtocolHandler "${urlString}"`);
              break;
            }
            default: {
              const browsers = ["xdg-open", "google-chrome", "firefox", "chromium-browser"];
              for (const browser of browsers) {
                try {
                  await execAsync(`which ${browser}`);
                  await execAsync(`${browser} "${urlString}"`);
                  break;
                } catch {
                  continue;
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to open browser:", error);
        }
      }
      cleanup() {
        if (this.server) {
          this.server.close();
          this.server = null;
        }
      }
    };
  }
});
var TokenType;
(function(TokenType2) {
  TokenType2["API_KEY"] = "API_KEY";
  TokenType2["CI_TOKEN"] = "CI_TOKEN";
})(TokenType || (TokenType = {}));
function getMainPackageUserAgent() {
  if (process.env.CP_MCP_MAIN_PKG) {
    if (process.env.CP_MCP_MAIN_PKG.includes("quantum-management-mcp")) {
      return "mgmt-mcp";
    }
  }
  return "Check Point MCP API Client";
}
var ClientResponse = class {
  constructor(status, response) {
    this.status = status;
    this.response = response;
  }
};
var APIClientBase = class {
  constructor(authToken = "", tokenType = TokenType.API_KEY) {
    this.authToken = authToken;
    this.tokenType = tokenType;
    this.sid = null;
    this.sessionTimeout = null;
    this.sessionStart = null;
  }
  /**
  * Create an API client instance - generic method for creating clients
  */
  static create(...args) {
    return new this(...args);
  }
  /**
   * Get headers for the API requests
   */
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": getMainPackageUserAgent()
    };
    if (this.sid) {
      headers["X-chkp-sid"] = this.sid;
    }
    return headers;
  }
  /**
   * Get debug mode
   */
  get debug() {
    return !!this._debug;
  }
  /**
   * Set debug mode
   */
  set debug(value) {
    this._debug = value;
  }
  /**
   * Call an API endpoint
   */
  async callApi(method, uri, data, params) {
    if (!this.sid || this.isSessionExpired()) {
      try {
        this.sid = await this.login();
      } catch (error) {
        if (error instanceof ClientResponse) {
          console.error(`Login failed with status ${error.status}:`, error.response);
          return error;
        }
        console.error("Login failed with unexpected error:", error);
        return new ClientResponse(500, { error: "Authentication failed", message: error.message });
      }
    }
    let httpsAgent;
    if (this instanceof OnPremAPIClient) {
      httpsAgent = new import_https.default.Agent({ rejectUnauthorized: false });
    }
    return await this.makeRequest(this.getHost(), method, uri, data, this.getHeaders(), params, httpsAgent);
  }
  /**
   * Check if the session is expired based on sessionTimeout and sessionStart
   */
  isSessionExpired() {
    if (!this.sid || !this.sessionTimeout || !this.sessionStart)
      return true;
    const now = Date.now();
    return now > this.sessionStart + (this.sessionTimeout - 5) * 1e3;
  }
  /**
   * Login to the API using the API key
   */
  async login() {
    const apiTokenHeader = this.tokenType === TokenType.API_KEY ? "api-key" : "ci-token";
    const loginResp = await this.makeRequest(this.getHost(), "POST", "login", { [apiTokenHeader]: this.authToken }, { "Content-Type": "application/json" });
    if (loginResp.status !== 200 || !loginResp.response || !loginResp.response.sid) {
      throw loginResp;
    }
    this.sessionTimeout = loginResp.response["session-timeout"] || null;
    this.sessionStart = Date.now();
    return loginResp.response.sid;
  }
  /**
   * Make a request to a Check Point API
   */
  async makeRequest(host, method, uri, data, headers = {}, params = null, httpsAgent) {
    uri = uri.replace(/^\//, "");
    const url = `${host}/${uri}`;
    const config = {
      method: method.toUpperCase(),
      url,
      headers,
      params: params || void 0
    };
    if (httpsAgent) {
      config.httpsAgent = httpsAgent;
    }
    if (method.toUpperCase() !== "GET" && data !== void 0) {
      config.data = data;
    }
    console.error(`API Request: ${method} ${url}`);
    try {
      const response = await (0, import_axios.default)(config);
      return new ClientResponse(response.status, response.data);
    } catch (error) {
      if (error.response) {
        console.error(`\u274C API Error (${error.response.status}):`);
        console.error("Headers:", error.response.headers);
        console.error("Data:", error.response.data);
        if (this.debug) {
          console.error("Debug mode: Printing request details:");
          console.error("Request Method:", method);
          console.error("Request URL:", url);
          console.error("Request Headers:", config.headers);
          console.error("Request Data:", config.data);
          console.error("Request Params:", config.params);
        }
      }
      if (error.response) {
        throw new Error(`API request failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
};
var SmartOneCloudAPIClient = class extends APIClientBase {
  constructor(authToken, tokenType, s1cUrl) {
    super(authToken, tokenType);
    this.s1cUrl = s1cUrl;
  }
  getHost() {
    return this.s1cUrl;
  }
};
var OnPremAPIClient = class extends APIClientBase {
  constructor(apiKey, managementHost, managementPort = "443", username, password) {
    super(apiKey || "");
    this.managementHost = managementHost;
    this.managementPort = managementPort;
    this.username = username;
    this.password = password;
  }
  getHost() {
    const managementHost = this.managementHost;
    const port = this.managementPort;
    return `https://${managementHost}:${port}/web_api`;
  }
  /**
  * Override login() to support both api-key and username/password authentication
  * and allow self-signed certificates
  */
  async login() {
    const isUsingApiKey = !!this.authToken;
    const isUsingCredentials = !!(this.username && this.password);
    if (!isUsingApiKey && !isUsingCredentials) {
      throw new ClientResponse(401, { message: "Authentication failed: No API key or username/password provided" });
    }
    const httpsAgent = new import_https.default.Agent({ rejectUnauthorized: false });
    const loginPayload = isUsingApiKey ? { "api-key": this.authToken } : { "user": this.username, "password": this.password };
    const loginResp = await this.makeRequest(this.getHost(), "POST", "login", loginPayload, { "Content-Type": "application/json" }, null, httpsAgent);
    if (loginResp.status !== 200 || !loginResp.response || !loginResp.response.sid) {
      throw loginResp;
    }
    this.sessionTimeout = loginResp.response["session-timeout"] || null;
    this.sessionStart = Date.now();
    this.sid = loginResp.response.sid;
    return loginResp.response.sid;
  }
};
function nullOrEmpty(val) {
  return val === void 0 || val === null || typeof val === "string" && (val.trim() === "" || val === "undefined" || val === "null");
}
function sanitizeData(kwargs) {
  const data = {};
  for (const [key, value] of Object.entries(kwargs)) {
    if (value === null || value === void 0 || value === "" || Array.isArray(value) && value.length === 0) {
      continue;
    }
    const safeKey = key.replace(/_/g, "-");
    data[safeKey] = value;
  }
  return data;
}
var APIManagerBase = class {
  constructor(client) {
    this.client = client;
    this.requestInfo = null;
    this.detailsLevel = "full";
    this._debug = false;
  }
  /**
   * Set debug mode for the API client
   */
  set debug(value) {
    this._debug = value;
    if (this.client) {
      if ("debug" in this.client) {
        this.client.debug = value;
      }
    }
  }
  /**
   * Get debug mode
   */
  get debug() {
    return this._debug;
  }
  /**
   * Call an API endpoint
   */
  async callApi(method, uri, data) {
    const sanitizedData = sanitizeData(data);
    const clientResponse = await this.client.callApi(method, uri, sanitizedData, void 0);
    return clientResponse.response;
  }
  /**
   * Create an API manager instance
   */
  static create(args) {
    throw new Error("Method must be implemented by subclass");
  }
  /**
   * Run a script on a target gateway
   */
  async runScript(targetGateway, scriptName, script) {
    const payload = {
      "script-name": scriptName,
      "script": script,
      "targets": [targetGateway]
    };
    const resp = await this.callApi("post", "run-script", payload);
    if (!resp.tasks) {
      return [false, { message: "Failed to run the script" }];
    }
    return [true, { tasks: resp.tasks.map((task) => task["task-id"]) }];
  }
  /**
   * Get the result of a task
   */
  async getTaskResult(taskId, maxRetries = 5) {
    let retries = 0;
    const timeouts = [1e3, 1e3, 2e3, 5e3, 5e3];
    while (retries < maxRetries) {
      const payload = {
        "task-id": taskId,
        "details-level": "full"
      };
      const response = await this.callApi("post", "show-task", payload);
      const taskDetails = response.tasks?.[0];
      if (taskDetails?.status === "succeeded" || taskDetails?.status === "failed") {
        if (taskDetails["task-details"]?.[0]?.responseMessage) {
          const responseMessageBase64 = taskDetails["task-details"][0].responseMessage;
          const decoded = Buffer.from(responseMessageBase64, "base64").toString("utf-8");
          return [taskDetails.status === "succeeded", decoded];
        }
        return [false, "failed to get task result"];
      } else {
        const timeout = timeouts[Math.min(retries, timeouts.length - 1)];
        console.error(`Try #${retries}: Task ${taskId} is still running, waiting for ${timeout}ms...`);
        retries++;
        await new Promise((resolve) => setTimeout(resolve, timeout));
      }
    }
    return [false, "Task did not complete in time"];
  }
};
var APIManagerForAPIKey = class extends APIManagerBase {
  static create(args) {
    if (args.managementHost) {
      const onPremClient = new OnPremAPIClient(args.apiKey, args.managementHost, args.managementPort || "443", args.username, args.password);
      return new this(onPremClient);
    }
    if (!args.s1cUrl) {
      throw new Error("Either management host or S1C URL must be provided");
    }
    let keyType;
    let key;
    if (args.cloudInfraToken) {
      keyType = TokenType.CI_TOKEN;
      key = args.cloudInfraToken;
    } else if (args.apiKey) {
      keyType = TokenType.API_KEY;
      key = args.apiKey;
    } else {
      throw new Error("API key or cloud infrastructure token is required");
    }
    return new this(SmartOneCloudAPIClient.create(key, keyType, args.s1cUrl));
  }
};
async function launchMCPServer(configPath, serverModule2) {
  const config = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
  const program = new import_commander.Command();
  if (config.description) {
    program.description(config.description);
  }
  config.options.forEach((option) => {
    const envValue = option.env ? process.env[option.env] : void 0;
    const defaultValue = option.default || envValue;
    if (option.type === "boolean") {
      const boolDefault = envValue === "true" || option.default === "true";
      program.option(option.flag, option.description, boolDefault);
    } else {
      program.option(option.flag, option.description, defaultValue);
    }
  });
  const transportTypeDefault = process.env.MCP_TRANSPORT_TYPE || "stdio";
  program.option("--transport <type>", "Transport type (stdio or http)", transportTypeDefault);
  const transportPortDefault = process.env.MCP_TRANSPORT_PORT || "3000";
  program.option("--transport-port <number>", "Port for network transports (e.g., HTTP)", transportPortDefault);
  const debugDefault = process.env.DEBUG === "true" || false;
  program.option("--debug", "Enable debug mode", debugDefault);
  program.parse(process.argv);
  const options = program.opts();
  if (!serverModule2.settingsManager) {
    throw new Error("ServerModule must have a settingsManager. Create it with createServerModule.");
  }
  const settings = serverModule2.settingsManager.createFromArgs(options);
  const transportType = (options.transport || process.env.MCP_TRANSPORT_TYPE || "stdio").toLowerCase() === "http" ? "http" : "stdio";
  const transportPort = options.transportPort ? parseInt(options.transportPort, 10) : process.env.MCP_TRANSPORT_PORT ? parseInt(process.env.MCP_TRANSPORT_PORT, 10) : 3e3;
  if (transportType === "http") {
    await launchHTTPServer(config, serverModule2, transportPort);
  } else {
    const transport = new import_stdio.StdioServerTransport();
    const defaultSessionId = "default";
    const sessionMetadata = {
      type: "stdio",
      startedAt: /* @__PURE__ */ new Date()
    };
    serverModule2.sessionManager.createSession(defaultSessionId, sessionMetadata);
    transport.extraContext = () => {
      return {
        sessionId: defaultSessionId,
        transport
      };
    };
    await serverModule2.server.connect(transport);
    console.error(`${config.name} running on stdio transport. Version: ${serverModule2.pkg.version}`);
    console.error(`Transport type: stdio`);
  }
}
async function launchHTTPServer(config, serverModule2, port) {
  const transports = {};
  const server2 = import_http2.default.createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/mcp") {
      const sessionId = req.headers["mcp-session-id"];
      if (req.method === "POST") {
        const chunks = [];
        try {
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const bodyBuffer = Buffer.concat(chunks);
          let body;
          try {
            const bodyText = bodyBuffer.toString("utf8");
            if (bodyText) {
              body = JSON.parse(bodyText);
            }
          } catch (err) {
            console.error("Error parsing request body:", err);
          }
          let transport;
          if (sessionId && transports[sessionId]) {
            transport = transports[sessionId];
            if (!serverModule2.settingsManager) {
              throw new Error("ServerModule must have a settingsManager. Create it with createServerModule.");
            }
            serverModule2.settingsManager.createFromHeaders(headersToEnvVars(req.headers, config), sessionId);
          } else if (!sessionId && body && body.method === "initialize") {
            transport = new import_streamableHttp.StreamableHTTPServerTransport({
              sessionIdGenerator: () => (0, import_crypto.randomUUID)(),
              onsessioninitialized: (sid) => {
                transports[sid] = transport;
                const headers = headersToEnvVars(req.headers, config);
                const metadata = {
                  userAgent: req.headers["user-agent"],
                  origin: req.headers.origin || req.headers.referer,
                  remoteAddress: req.socket.remoteAddress,
                  initialPath: req.url
                };
                serverModule2.sessionManager.createSession(sid, metadata);
                serverModule2.settingsManager.createFromHeaders(headers, sid);
              }
            });
            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid) {
                delete transports[sid];
                serverModule2.settingsManager.clearSession(sid);
                serverModule2.apiManagerFactory.clearSession(sid);
                serverModule2.sessionManager.removeSession(sid);
              }
            };
            if (!serverModule2.settingsManager) {
              throw new Error("ServerModule must have a settingsManager. Create it with createServerModule.");
            }
            transport.extraContext = (msg) => {
              const sessionId2 = transport.sessionId;
              return {
                sessionId: sessionId2,
                transport
              };
            };
            await serverModule2.server.connect(transport).catch((error) => {
              console.error("Error connecting to HTTP transport:", error);
            });
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32e3,
                message: "Bad Request: No valid session ID provided"
              },
              id: null
            }));
            return;
          }
          await transport.handleRequest(req, res, body);
        } catch (error) {
          console.error("Error handling POST request:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32e3,
              message: "Internal server error: " + error.message
            },
            id: null
          }));
        }
      } else if (req.method === "GET") {
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid or missing session ID");
          return;
        }
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } else if (req.method === "DELETE") {
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid or missing session ID");
          return;
        }
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain", "Allow": "GET, POST, DELETE" });
        res.end("Method not allowed");
      }
    } else if (req.url === "/health" || req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const sessionCount = serverModule2.sessionManager.getSessionCount();
      const sessions = serverModule2.sessionManager.getAllSessions().map((session) => ({
        id: session.sessionId,
        createdAt: session.createdAt,
        lastActive: session.lastActive
        // Don't include potentially sensitive metadata
      }));
      res.end(JSON.stringify({
        status: "ok",
        server: config.name,
        version: serverModule2.pkg.version,
        activeSessions: sessionCount,
        sessions
      }));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  });
  server2.listen(port, () => {
    console.error(`${config.name} running on HTTP transport at http://localhost:${port}. Version: ${serverModule2.pkg.version}`);
    console.error(`Transport type: HTTP, Transport-port: ${port}`);
  });
  server2.on("error", (err) => {
    console.error(`Server error: ${err.message}`);
  });
}
function headersToEnvVars(headers, config) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== void 0) {
      const envName = name.toUpperCase().replace(/-/g, "_");
      result[envName] = value;
    }
  }
  if (config && config.options) {
    const headerToEnvMap = {};
    for (const option of config.options) {
      if (option.env) {
        const flagName = option.flag.split(" ")[0].replace(/^--?/, "").replace(/-/g, "_");
        headerToEnvMap[flagName.toLowerCase()] = option.env;
        headerToEnvMap[option.env.toLowerCase()] = option.env;
      }
    }
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (headerValue !== void 0) {
        const normalizedHeaderName = headerName.toLowerCase().replace(/-/g, "_");
        const envVarName = headerToEnvMap[normalizedHeaderName];
        if (envVarName) {
          result[envVarName] = headerValue;
        }
      }
    }
  }
  return result;
}
var SettingsManager = class _SettingsManager {
  /**
   * Creates a new SettingsManager
   * @param settingsClass The Settings class to use for creating settings instances
   */
  constructor(settingsClass) {
    this.settingsMap = /* @__PURE__ */ new Map();
    this.defaultSessionId = "default";
    this.settingsClass = settingsClass;
  }
  /**
   * Get settings for a specific session
   * @param sessionId The session ID (defaults to 'default' for stdio mode)
   * @returns Settings instance for the session
   */
  getSettings(sessionId) {
    const sid = sessionId || this.defaultSessionId;
    if (!this.settingsMap.has(sid)) {
      this.settingsMap.set(sid, new this.settingsClass());
    }
    return this.settingsMap.get(sid);
  }
  /**
   * Set settings for a specific session
   * @param settings The settings object to set
   * @param sessionId The session ID (defaults to 'default' for stdio mode)
   */
  setSettings(settings, sessionId) {
    const sid = sessionId || this.defaultSessionId;
    this.settingsMap.set(sid, settings);
  }
  /**
   * Injects debug settings from source into settings object
   * @param settings The settings object to update
   * @param source Source object containing debug information
   * @private
   */
  injectDebug(settings, source) {
    const debug = source?.debug ?? _SettingsManager.globalDebugState ?? process.env.DEBUG;
    if (typeof debug !== "undefined") {
      if (source?.debug !== void 0) {
        _SettingsManager.globalDebugState = source.debug;
      }
      if (typeof settings.set === "function") {
        settings.set("debug", debug);
      } else {
        settings.debug = debug;
      }
      if (debug) {
        console.error("Debug enabled. Source object contents:");
        console.error(JSON.stringify(source, null, 2));
      }
    }
  }
  /**
   * Print settings object for debugging by dynamically discovering its properties
   * @param settings The settings object to print
   * @private
   */
  printSettingsDebug(settings) {
    if (typeof settings.get === "function") {
      console.error("Settings (using get method):");
      if (settings.data && typeof settings.data === "object") {
        Object.entries(settings.data).forEach(([key, value]) => {
          console.error(`  ${key}: ${JSON.stringify(value)}`);
        });
      } else {
        console.error("  Unable to enumerate settings properties - no accessible data structure");
      }
    } else {
      console.error("Settings (plain object):");
      Object.entries(settings).forEach(([key, value]) => {
        console.error(`  ${key}: ${JSON.stringify(value)}`);
      });
    }
  }
  /**
   * Create settings from command-line arguments
   * @param args Command line arguments
   * @param sessionId Optional session ID
   * @returns Settings instance
   */
  createFromArgs(args, sessionId) {
    const settings = this.settingsClass.fromArgs(args);
    this.injectDebug(settings, args);
    this.setSettings(settings, sessionId);
    return settings;
  }
  /**
   * Create settings from HTTP headers
   * @param headers HTTP headers
   * @param sessionId Optional session ID
   * @returns Settings instance
   */
  createFromHeaders(headers, sessionId) {
    if (_SettingsManager.globalDebugState) {
      console.error("=== createFromHeaders Debug Info ===");
      console.error("Incoming headers:");
      console.error(JSON.stringify(headers, null, 2));
    }
    const normalizedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.includes("_") ? key.replace(/_/g, "-") : key;
      normalizedHeaders[normalizedKey] = value;
    }
    if (_SettingsManager.globalDebugState) {
      console.error("Normalized headers:");
      console.error(JSON.stringify(normalizedHeaders, null, 2));
    }
    const debugHeader = normalizedHeaders["debug"] || normalizedHeaders["Debug"] || normalizedHeaders["DEBUG"];
    const debugSource = { debug: debugHeader !== void 0 ? debugHeader : _SettingsManager.globalDebugState };
    const settings = this.settingsClass.fromHeaders(normalizedHeaders);
    this.injectDebug(settings, debugSource);
    if (_SettingsManager.globalDebugState) {
      console.error("Final settings object:");
      this.printSettingsDebug(settings);
      console.error("=== End createFromHeaders Debug Info ===");
    }
    this.setSettings(settings, sessionId);
    return settings;
  }
  /**
   * Clear settings for a session
   * @param sessionId The session ID to clear
   */
  clearSession(sessionId) {
    if (sessionId !== this.defaultSessionId) {
      this.settingsMap.delete(sessionId);
    }
  }
};
SettingsManager.globalDebugState = void 0;
var APIManagerFactory = class {
  /**
   * Creates a new APIManagerFactory
   * @param apiManagerClass The API Manager class to use for creating instances
   * @param settingsManager The settings manager to get settings from
   */
  constructor(apiManagerClass, settingsManager) {
    this.apiManagerMap = /* @__PURE__ */ new Map();
    this.defaultSessionId = "default";
    this.apiManagerClass = apiManagerClass;
    this.settingsManager = settingsManager;
  }
  /**
   * Get or create an API manager for a specific session
   * @param sessionId The session ID (defaults to 'default' for stdio mode)
   * @returns API Manager instance for the session
   */
  getAPIManager(sessionId) {
    const sid = sessionId || this.defaultSessionId;
    if (!this.apiManagerMap.has(sid)) {
      const settings2 = this.settingsManager.getSettings(sid);
      const apiManager2 = this.createAPIManagerFromSettings(settings2);
      this.apiManagerMap.set(sid, apiManager2);
    }
    const apiManager = this.apiManagerMap.get(sid);
    const settings = this.settingsManager.getSettings(sid);
    if (settings && typeof settings.debug !== "undefined") {
      apiManager.debug = !!settings.debug;
    }
    return apiManager;
  }
  /**
   * Create an API manager from settings
   * @param settings Settings instance
   * @returns API Manager instance
   */
  createAPIManagerFromSettings(settings) {
    return this.apiManagerClass.create(settings);
  }
  /**
   * Clear API manager for a session
   * @param sessionId The session ID to clear
   */
  clearSession(sessionId) {
    if (sessionId !== this.defaultSessionId) {
      this.apiManagerMap.delete(sessionId);
    }
  }
};
var _a;
var SessionContext = class {
  /**
   * Start automatic cleanup timer
   */
  static startCleanupTimer() {
    if (this.cleanupTimer)
      return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  /**
   * Clean up expired sessions
   */
  static cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];
    for (const [sessionId, sessionInfo] of this.sessionData.entries()) {
      if (sessionId === this.DEFAULT_SESSION_ID)
        continue;
      if (now - sessionInfo.lastAccessed > this.SESSION_TIMEOUT_MS) {
        expiredSessions.push(sessionId);
      }
    }
    expiredSessions.forEach((sessionId) => {
      this.sessionData.delete(sessionId);
    });
    if (this.sessionData.size > this.MAX_SESSIONS) {
      const sessions = Array.from(this.sessionData.entries()).filter(([sessionId]) => sessionId !== this.DEFAULT_SESSION_ID).sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
      const toRemove = sessions.slice(0, sessions.length - this.MAX_SESSIONS + 1);
      toRemove.forEach(([sessionId]) => {
        this.sessionData.delete(sessionId);
      });
    }
  }
  /**
   * Get the current session ID from the MCP extra context
   * @param extra Extra context passed to MCP tool callbacks
   * @returns The session ID or DEFAULT_SESSION_ID if not available
   */
  static getSessionId(extra) {
    if (!extra)
      return this.DEFAULT_SESSION_ID;
    if (extra.transport && extra.transport.sessionId) {
      return extra.transport.sessionId;
    }
    if (extra.sessionId) {
      return extra.sessionId;
    }
    return this.DEFAULT_SESSION_ID;
  }
  /**
   * Get settings for the current session
   * @param serverModule ServerModule with settingsManager
   * @param extra Extra context passed to MCP tool callbacks
   * @returns Settings for the current session
   */
  static getSettings(serverModule2, extra) {
    const sessionId = this.getSessionId(extra);
    if (!serverModule2.settingsManager) {
      throw new Error("ServerModule does not have a settingsManager. Create it with createServerModule.");
    }
    return serverModule2.settingsManager.getSettings(sessionId);
  }
  /**
   * Get API manager for the current session
   * @param serverModule ServerModule with apiManagerFactory
   * @param extra Extra context passed to MCP tool callbacks
   * @returns API manager for the current session
   */
  static getAPIManager(serverModule2, extra) {
    const sessionId = this.getSessionId(extra);
    if (!serverModule2.apiManagerFactory) {
      throw new Error("ServerModule does not have an apiManagerFactory. Create it with createServerModule.");
    }
    return serverModule2.apiManagerFactory.getAPIManager(sessionId);
  }
  /**
   * Set session data for the current session
   * @param key The key to store the data under
   * @param value The value to store
   * @param extra Extra context with session information
   */
  static setData(key, value, extra) {
    const sessionId = this.getSessionId(extra);
    const now = Date.now();
    if (!this.sessionData.has(sessionId)) {
      this.sessionData.set(sessionId, {
        data: /* @__PURE__ */ new Map(),
        lastAccessed: now,
        createdAt: now
      });
    }
    const sessionInfo = this.sessionData.get(sessionId);
    sessionInfo.lastAccessed = now;
    sessionInfo.data.set(key, value);
  }
  /**
   * Get session data for the current session
   * @param key The key to retrieve data for
   * @param extra Extra context with session information
   * @returns The stored data or undefined if not found
   */
  static getData(key, extra) {
    const sessionId = this.getSessionId(extra);
    if (!this.sessionData.has(sessionId)) {
      return void 0;
    }
    const sessionInfo = this.sessionData.get(sessionId);
    sessionInfo.lastAccessed = Date.now();
    return sessionInfo.data.get(key);
  }
  /**
   * Clear session data for a specific session
   * @param sessionId The session ID to clear
   */
  static clearSessionData(sessionId) {
    this.sessionData.delete(sessionId);
  }
  /**
   * Get session statistics (for monitoring)
   */
  static getSessionStats() {
    const now = Date.now();
    let oldestAccess = null;
    for (const [, sessionInfo] of this.sessionData.entries()) {
      if (oldestAccess === null || sessionInfo.lastAccessed < oldestAccess) {
        oldestAccess = sessionInfo.lastAccessed;
      }
    }
    return {
      totalSessions: this.sessionData.size,
      memoryUsage: this.sessionData.size * 1e3,
      // Rough estimate
      oldestSession: oldestAccess ? now - oldestAccess : null
    };
  }
  /**
   * Get or prompt for user interactive data with automatic caching and expiration
   * @param options Configuration for the interactive data request
   * @param extra Extra context with session information
   * @returns Promise that resolves to the user data (either from cache or fresh prompt)
   */
  static async getOrPromptUserData(options, extra) {
    const sessionId = this.getSessionId(extra);
    const now = Date.now();
    const expirationMs = (options.expirationMinutes || 30) * 60 * 1e3;
    const cachedData = this.getData(options.cacheKey, extra);
    if (cachedData && cachedData.expiresAt && now < cachedData.expiresAt) {
      const refreshedData = {
        ...cachedData,
        expiresAt: now + expirationMs,
        lastUsed: now
      };
      this.setData(options.cacheKey, refreshedData, extra);
      let dataToReturn2 = cachedData.data;
      if (options.fieldsToShow) {
        dataToReturn2 = {};
        for (const field of options.fieldsToShow) {
          if (cachedData.data[field] !== void 0) {
            dataToReturn2[field] = cachedData.data[field];
          }
        }
      }
      console.error(`Using cached user data for session: ${sessionId}, key: ${options.cacheKey}`);
      return { cancelled: false, data: dataToReturn2 };
    }
    console.error(`Prompting user for data for session: ${sessionId}, key: ${options.cacheKey}`);
    let result;
    if (options.showLoginDialog) {
      const { showLoginDialog: showLoginDialog2 } = await Promise.resolve().then(() => (init_ui_dialog(), ui_dialog_exports));
      result = await showLoginDialog2(options.dialogTitle, options.dialogMessage);
    } else {
      const { showDialog: showDialog2 } = await Promise.resolve().then(() => (init_ui_dialog(), ui_dialog_exports));
      const defaultFields = [
        {
          name: "message",
          label: "Message",
          type: "text",
          placeholder: "Enter your message here...",
          required: true
        }
      ];
      result = await showDialog2({
        title: options.dialogTitle || "Input Required",
        message: options.dialogMessage,
        fields: options.customFields || defaultFields
      });
    }
    if (result.cancelled) {
      return result;
    }
    const cachedEntry = {
      data: result.data,
      expiresAt: now + expirationMs,
      createdAt: now,
      lastUsed: now
    };
    this.setData(options.cacheKey, cachedEntry, extra);
    let dataToReturn = result.data;
    if (options.fieldsToShow) {
      dataToReturn = {};
      for (const field of options.fieldsToShow) {
        if (result.data[field] !== void 0) {
          dataToReturn[field] = result.data[field];
        }
      }
    }
    return { cancelled: false, data: dataToReturn };
  }
  /**
   * Clear cached user data for a specific key
   * @param cacheKey The cache key to clear
   * @param extra Extra context with session information
   */
  static clearUserData(cacheKey, extra) {
    const sessionId = this.getSessionId(extra);
    if (this.sessionData.has(sessionId)) {
      const sessionInfo = this.sessionData.get(sessionId);
      sessionInfo.data.delete(cacheKey);
      sessionInfo.lastAccessed = Date.now();
    }
  }
  /**
   * Check if user data exists and is not expired
   * @param cacheKey The cache key to check
   * @param extra Extra context with session information
   * @returns true if valid cached data exists, false otherwise
   */
  static hasValidUserData(cacheKey, extra) {
    const cachedData = this.getData(cacheKey, extra);
    if (!cachedData || !cachedData.expiresAt) {
      return false;
    }
    return Date.now() < cachedData.expiresAt;
  }
};
_a = SessionContext;
SessionContext.DEFAULT_SESSION_ID = "default";
SessionContext.sessionData = /* @__PURE__ */ new Map();
SessionContext.SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1e3;
SessionContext.CLEANUP_INTERVAL_MS = 60 * 60 * 1e3;
SessionContext.MAX_SESSIONS = 1e3;
SessionContext.cleanupTimer = null;
(() => {
  _a.startCleanupTimer();
})();
var DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
var SessionManager = class {
  constructor() {
    this.sessions = /* @__PURE__ */ new Map();
  }
  /**
   * Create a new session
   * @param sessionId The session ID
   * @param metadata Optional metadata to store with the session
   * @returns Session info
   */
  createSession(sessionId, metadata = {}) {
    const now = /* @__PURE__ */ new Date();
    const sessionInfo = {
      sessionId,
      createdAt: now,
      lastActive: now,
      ...metadata
    };
    this.sessions.set(sessionId, sessionInfo);
    return sessionInfo;
  }
  /**
   * Get info for a session
   * @param sessionId The session ID
   * @returns Session info or undefined if not found
   */
  getSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.touchSession(sessionId);
    }
    return this.sessions.get(sessionId);
  }
  /**
   * Update session activity timestamp
   * @param sessionId The session ID
   */
  touchSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActive = /* @__PURE__ */ new Date();
    }
  }
  /**
   * Remove a session
   * @param sessionId The session ID
   */
  removeSession(sessionId) {
    this.sessions.delete(sessionId);
    SessionContext.clearSessionData(sessionId);
  }
  /**
   * Get all active sessions
   * @returns Array of session info objects
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }
  /**
   * Get count of active sessions
   * @returns Number of active sessions
   */
  getSessionCount() {
    return this.sessions.size;
  }
  /**
   * Clean up inactive sessions older than the specified timeout
   * @param timeoutMs Timeout in milliseconds (default: 30 minutes)
   * @returns Number of sessions removed
   */
  cleanupInactiveSessions(timeoutMs = DEFAULT_SESSION_TIMEOUT_MS) {
    const now = /* @__PURE__ */ new Date();
    let removedCount = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now.getTime() - session.lastActive.getTime();
      if (inactiveTime > timeoutMs) {
        this.removeSession(sessionId);
        removedCount++;
      }
    }
    return removedCount;
  }
};
function getHeaderValue(headers, key) {
  const value = headers[key] || headers[key.toUpperCase()] || headers[key.toLowerCase()];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
}
function createApiRunner(serverModule2) {
  return async (method, uri, data, extra) => {
    const apiManager = SessionContext.getAPIManager(serverModule2, extra);
    return await apiManager.callApi(method, uri, data);
  };
}
function createServerModule(server2, Settings2, pkg2, apiManagerClass) {
  const settingsManager = new SettingsManager(Settings2);
  const apiManagerFactory = new APIManagerFactory(apiManagerClass, settingsManager);
  const sessionManager = new SessionManager();
  return {
    server: server2,
    Settings: Settings2,
    settingsManager,
    apiManagerFactory,
    sessionManager,
    pkg: pkg2
  };
}
init_ui_dialog();
var Settings = class _Settings {
  constructor({ apiKey = process.env.API_KEY, username = process.env.USERNAME, password = process.env.PASSWORD, s1cUrl = process.env.S1C_URL, managementHost = process.env.MANAGEMENT_HOST, managementPort = process.env.MANAGEMENT_PORT || "443", cloudInfraToken = process.env.CLOUD_INFRA_TOKEN, clientId = process.env.CLIENT_ID, secretKey = process.env.SECRET_KEY, region = process.env.REGION || "EU", devPort = process.env.DEV_PORT || "8006" } = {}) {
    this.region = "EU";
    this.devPort = "8006";
    this.apiKey = apiKey;
    this.username = username;
    this.password = password;
    this.s1cUrl = s1cUrl;
    this.managementHost = managementHost;
    this.managementPort = managementPort;
    this.cloudInfraToken = cloudInfraToken;
    this.clientId = clientId;
    this.secretKey = secretKey;
    this.region = this.isValidRegion(region) ? region : "EU";
    this.devPort = devPort;
    this.validate();
  }
  /**
   * Check if the provided string is a valid region
   */
  isValidRegion(region) {
    return ["EU", "US", "STG", "LOCAL"].includes(region.toUpperCase());
  }
  /**
   * Get Cloud Infra Gateway based on region
   */
  getCloudInfraGateway() {
    switch (this.region) {
      case "EU":
        return "https://cloudinfra-gw.portal.checkpoint.com";
      case "US":
        return "https://cloudinfra-gw-us.portal.checkpoint.com";
      case "STG":
      case "LOCAL":
        return "https://dev-cloudinfra-gw.kube1.iaas.checkpoint.com";
      default:
        return "";
    }
  }
  /**
   * Validate the settings
   */
  validate() {
    if (!nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.apiKey) && nullOrEmpty(this.cloudInfraToken)) {
      throw new Error("API key or CI Token is required for S1C (via --api-key or API_KEY env var)");
    }
    if (!nullOrEmpty(this.managementHost) && nullOrEmpty(this.apiKey) && (nullOrEmpty(this.username) || nullOrEmpty(this.password))) {
      throw new Error("Either API key or username/password are required for on-prem management (via CLI args or env vars)");
    }
    if (nullOrEmpty(this.s1cUrl) && nullOrEmpty(this.managementHost)) {
    }
  }
  /**
   * Create settings from command-line arguments
   */
  static fromArgs(args) {
    return new _Settings({
      apiKey: args.apiKey,
      username: args.username,
      password: args.password,
      s1cUrl: args.s1cUrl,
      managementHost: args.managementHost,
      managementPort: args.managementPort,
      cloudInfraToken: args.cloudInfraToken,
      clientId: args.clientId,
      secretKey: args.secretKey,
      region: typeof args.region === "string" ? args.region.toUpperCase() : void 0,
      devPort: args.devPort
    });
  }
  /**
   * Create settings from HTTP headers
   * Maps headers to environment variable format based on server config
   */
  static fromHeaders(headers) {
    return new _Settings({
      apiKey: getHeaderValue(headers, "API-KEY"),
      username: getHeaderValue(headers, "USERNAME"),
      password: getHeaderValue(headers, "PASSWORD"),
      s1cUrl: getHeaderValue(headers, "S1C-URL"),
      managementHost: getHeaderValue(headers, "MANAGEMENT-HOST"),
      managementPort: getHeaderValue(headers, "MANAGEMENT-PORT"),
      cloudInfraToken: getHeaderValue(headers, "CLOUD-INFRA-TOKEN"),
      clientId: getHeaderValue(headers, "CLIENT-ID"),
      secretKey: getHeaderValue(headers, "SECRET-KEY"),
      region: getHeaderValue(headers, "REGION")?.toUpperCase(),
      devPort: getHeaderValue(headers, "DEV-PORT")
    });
  }
};
var ObjectResolver = class {
  constructor(objectsDictionary) {
    this.objects = /* @__PURE__ */ new Map();
    objectsDictionary.forEach((obj) => {
      this.objects.set(obj.uid, obj);
    });
  }
  /**
   * Resolve a UID to a detailed object with formatted parameters
   */
  resolve(uid) {
    const obj = this.objects.get(uid);
    if (!obj) {
      return {
        uid,
        name: `Unknown (${uid})`,
        type: "unknown",
        params: ""
      };
    }
    return {
      uid: obj.uid,
      name: obj.name,
      type: obj.type,
      params: this.formatParams(obj)
    };
  }
  /**
   * Resolve multiple UIDs
   */
  resolveMultiple(uids) {
    if (!Array.isArray(uids)) {
      return [this.resolve(uids)];
    }
    return uids.map((uid) => this.resolve(uid));
  }
  /**
   * Format object parameters based on type
   */
  formatParams(obj) {
    switch (obj.type) {
      case "host":
        return obj["ipv4-address"] || "";
      case "network":
        if (obj.subnet4 && obj["mask-length4"]) {
          return `${obj.subnet4}/${obj["mask-length4"]}`;
        }
        return obj["subnet-mask"] ? `mask: ${obj["subnet-mask"]}` : "";
      case "service-tcp":
      case "service-udp":
        return obj.port ? `port: ${obj.port}` : "";
      case "service-icmp":
        return "ICMP";
      case "service-group":
        return "group";
      case "group":
        return "group";
      case "access-role":
        return "access-role";
      case "application-site":
        return "application";
      case "simple-gateway":
        return "gateway";
      case "security-zone":
        return "zone";
      case "access-layer":
        return "layer";
      case "time":
        return "time-object";
      case "CpmiAnyObject":
        return "any";
      case "Internet":
        return "internet";
      case "RulebaseAction":
        return "";
      default:
        return obj.type || "";
    }
  }
  /**
   * Get a short display string for an object
   */
  getDisplayString(uid) {
    const obj = this.resolve(uid);
    const params = obj.params ? ` (${obj.params})` : "";
    return `${obj.name}${params}`;
  }
  /**
   * Get a detailed display string with type
   */
  getDetailedString(uid) {
    const obj = this.resolve(uid);
    const type = obj.type !== "unknown" ? ` [${obj.type}]` : "";
    const params = obj.params ? ` (${obj.params})` : "";
    return `${obj.name}${type}${params}`;
  }
};
async function fetchRulebaseByUid(uid, apiManager) {
  try {
    const response = await apiManager.callApi("POST", "show-access-rulebase", { uid });
    return response;
  } catch (error) {
    throw new Error(`Failed to fetch rulebase: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function fetchObjectByUid(uid, apiManager) {
  try {
    const response = await apiManager.callApi("POST", "show-object", {
      uid,
      "details-level": "full"
    });
    return response;
  } catch (error) {
    throw new Error(`Failed to fetch object: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function parseRulebaseWithInlineLayers(jsonData, apiManager, expandGroups = false, groupMode = "in-rule") {
  const inlineLayerUids = collectInlineLayerUids(jsonData);
  let mergedObjectsDictionary = jsonData["objects-dictionary"] || [];
  let inlineLayersData = {};
  if (inlineLayerUids.size > 0 && apiManager) {
    console.log(`Found ${inlineLayerUids.size} inline layers to fetch...`);
    for (const uid of inlineLayerUids) {
      try {
        console.log(`Fetching inline layer: ${uid}`);
        const inlineData = await fetchRulebaseByUid(uid, apiManager);
        inlineLayersData[uid] = inlineData;
        if (inlineData["objects-dictionary"]) {
          mergedObjectsDictionary = [...mergedObjectsDictionary, ...inlineData["objects-dictionary"]];
        }
        const nestedUids = collectInlineLayerUids(inlineData);
        for (const nestedUid of nestedUids) {
          if (!inlineLayerUids.has(nestedUid)) {
            inlineLayerUids.add(nestedUid);
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch inline layer ${uid}:`, error);
      }
    }
  }
  let groupsData = {};
  if (expandGroups && apiManager) {
    const groupUids = collectGroupUids(jsonData, mergedObjectsDictionary);
    if (groupUids.size > 0) {
      console.log(`Found ${groupUids.size} groups to expand...`);
      groupsData = await fetchGroupsRecursively(groupUids, apiManager);
    }
  }
  const resolver = new ObjectResolver(mergedObjectsDictionary);
  const result = {
    name: jsonData.name || "Unknown Policy",
    uid: jsonData.uid,
    sections: [],
    groupsData,
    // Store groups data for reference mode
    groupMode
  };
  if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
    jsonData.rulebase.forEach((item) => {
      if (item.type === "access-section") {
        result.sections.push(parseSection(item, resolver, inlineLayersData, groupsData, groupMode));
      } else if (item.type === "access-rule") {
        if (result.sections.length === 0) {
          result.sections.push({
            name: "Rules",
            type: "access-section",
            from: 1,
            to: 999,
            rules: []
          });
        }
        result.sections[result.sections.length - 1].rules.push(parseRule(item, resolver, inlineLayersData, groupsData, groupMode));
      }
    });
  }
  return result;
}
function collectInlineLayerUids(jsonData) {
  const uids = /* @__PURE__ */ new Set();
  function collectFromRulebase(rulebase) {
    rulebase.forEach((item) => {
      if (item.type === "access-section" && item.rulebase) {
        collectFromRulebase(item.rulebase);
      } else if (item.type === "access-rule" && item["inline-layer"]) {
        const inlineLayer = item["inline-layer"];
        if (typeof inlineLayer === "string") {
          uids.add(inlineLayer);
        } else if (inlineLayer.uid) {
          uids.add(inlineLayer.uid);
        }
      }
    });
  }
  if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
    collectFromRulebase(jsonData.rulebase);
  }
  return uids;
}
function collectGroupUids(jsonData, objectsDictionary) {
  const uids = /* @__PURE__ */ new Set();
  objectsDictionary.forEach((obj) => {
    if (obj.type === "group") {
      uids.add(obj.uid);
    }
  });
  function scanRulebaseForGroups(rulebase) {
    rulebase.forEach((item) => {
      if (item.type === "access-section" && item.rulebase) {
        scanRulebaseForGroups(item.rulebase);
      } else if (item.type === "access-rule") {
        const fields = [item.source, item.destination, item.service, item.time];
        fields.forEach((field) => {
          if (Array.isArray(field)) {
            field.forEach((ref) => {
              if (typeof ref === "string") {
                const obj = objectsDictionary.find((o) => o.uid === ref);
                if (obj && obj.type === "group") {
                  uids.add(ref);
                }
              } else if (ref && ref.uid && ref.type === "group") {
                uids.add(ref.uid);
              }
            });
          }
        });
      }
    });
  }
  if (jsonData.rulebase && Array.isArray(jsonData.rulebase)) {
    scanRulebaseForGroups(jsonData.rulebase);
  }
  return uids;
}
async function fetchGroupsRecursively(groupUids, apiManager) {
  const groupsData = {};
  const processedUids = /* @__PURE__ */ new Set();
  async function processGroup(uid) {
    if (processedUids.has(uid)) return;
    processedUids.add(uid);
    try {
      const groupData = await fetchObjectByUid(uid, apiManager);
      if (groupData && groupData.object) {
        groupsData[uid] = groupData.object;
        if (groupData.object.members && Array.isArray(groupData.object.members)) {
          for (const member of groupData.object.members) {
            if (member.type === "group" && !processedUids.has(member.uid)) {
              await processGroup(member.uid);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch group ${uid}:`, error);
    }
  }
  for (const uid of groupUids) {
    await processGroup(uid);
  }
  return groupsData;
}
function resolveWithGroups(objects, groupsData, groupMode) {
  if (groupMode === "as-reference") {
    return objects;
  }
  const expandedObjects = [];
  objects.forEach((obj) => {
    if (obj.type === "group" && groupsData[obj.uid]) {
      const groupData = groupsData[obj.uid];
      if (groupData.members && Array.isArray(groupData.members)) {
        const expandedMembers = expandGroupMembers(groupData.members, groupsData);
        expandedObjects.push(...expandedMembers);
      }
    } else {
      expandedObjects.push(obj);
    }
  });
  return expandedObjects;
}
function expandGroupMembers(members, groupsData) {
  const expanded = [];
  members.forEach((member) => {
    if (member.type === "group" && groupsData[member.uid]) {
      const nestedGroupData = groupsData[member.uid];
      if (nestedGroupData.members && Array.isArray(nestedGroupData.members)) {
        expanded.push(...expandGroupMembers(nestedGroupData.members, groupsData));
      }
    } else {
      expanded.push(member);
    }
  });
  return expanded;
}
function parseSection(sectionData, resolver, inlineLayersData = {}, groupsData = {}, groupMode = "in-rule") {
  const section = {
    name: sectionData.name || "Unnamed Section",
    uid: sectionData.uid,
    type: sectionData.type,
    from: sectionData.from,
    to: sectionData.to,
    rules: []
  };
  if (sectionData.rulebase && Array.isArray(sectionData.rulebase)) {
    sectionData.rulebase.forEach((rule) => {
      if (rule.type === "access-rule") {
        section.rules.push(parseRule(rule, resolver, inlineLayersData, groupsData, groupMode));
      }
    });
  }
  return section;
}
function parseRule(ruleData, resolver, inlineLayersData = {}, groupsData = {}, groupMode = "in-rule") {
  const rule = {
    uid: ruleData.uid,
    name: ruleData.name || "Unnamed Rule",
    ruleNumber: ruleData["rule-number"],
    parentRuleNumber: null,
    // For inline layer rules
    enabled: ruleData.enabled !== false,
    // Resolve sources with group expansion
    sources: resolveWithGroups(resolver.resolveMultiple(ruleData.source || []), groupsData, groupMode),
    sourceNegate: ruleData["source-negate"] || false,
    // Resolve destinations with group expansion
    destinations: resolveWithGroups(resolver.resolveMultiple(ruleData.destination || []), groupsData, groupMode),
    destinationNegate: ruleData["destination-negate"] || false,
    // Resolve services with group expansion
    services: resolveWithGroups(resolver.resolveMultiple(ruleData.service || []), groupsData, groupMode),
    serviceNegate: ruleData["service-negate"] || false,
    // Resolve action
    action: resolver.resolve(ruleData.action),
    // Additional fields
    track: ruleData.track,
    time: resolver.resolveMultiple(ruleData.time || []),
    content: resolver.resolveMultiple(ruleData.content || []),
    vpn: resolver.resolveMultiple(ruleData.vpn || []),
    comments: ruleData.comments || "",
    // Inline layer handling
    inlineLayer: ruleData["inline-layer"] ? resolver.resolve(ruleData["inline-layer"]) : null,
    inlineRules: [],
    // Will contain nested rules if this rule has an inline layer
    // Meta information
    metaInfo: ruleData["meta-info"] || {},
    installOn: resolver.resolveMultiple(ruleData["install-on"] || [])
  };
  if (rule.inlineLayer && rule.inlineLayer.uid && inlineLayersData[rule.inlineLayer.uid]) {
    const inlineData = inlineLayersData[rule.inlineLayer.uid];
    rule.inlineRules = parseInlineLayerRules(inlineData, resolver, rule.ruleNumber, groupsData, groupMode);
  }
  return rule;
}
function parseInlineLayerRules(inlineData, resolver, parentRuleNumber, groupsData = {}, groupMode = "in-rule") {
  const inlineRules = [];
  let subruleIndex = 1;
  if (inlineData.rulebase && Array.isArray(inlineData.rulebase)) {
    inlineData.rulebase.forEach((item) => {
      if (item.type === "access-section" && item.rulebase) {
        item.rulebase.forEach((rule) => {
          if (rule.type === "access-rule") {
            const parsedRule = parseRule(rule, resolver, {}, groupsData, groupMode);
            parsedRule.ruleNumber = `${parentRuleNumber}.${subruleIndex}`;
            parsedRule.parentRuleNumber = parentRuleNumber;
            inlineRules.push(parsedRule);
            subruleIndex++;
          }
        });
      } else if (item.type === "access-rule") {
        const parsedRule = parseRule(item, resolver, {}, groupsData, groupMode);
        parsedRule.ruleNumber = `${parentRuleNumber}.${subruleIndex}`;
        parsedRule.parentRuleNumber = parentRuleNumber;
        inlineRules.push(parsedRule);
        subruleIndex++;
      }
    });
  }
  return inlineRules;
}
function formatAsTable(parsedData) {
  const lines = [];
  lines.push(`Check Point Rulebase: ${parsedData.name}`);
  lines.push("=".repeat(120));
  lines.push("");
  parsedData.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      lines.push("");
    }
    lines.push("=".repeat(80));
    lines.push(`SECTION: ${section.name} (Rules ${section.from}-${section.to})`);
    lines.push("=".repeat(80));
    lines.push("");
    if (section.uid) {
      lines.push(`Layer UID: ${section.uid}`);
    }
    if (section.domain) {
      lines.push(`Domain: ${section.domain.name || section.domain}`);
    }
    lines.push("");
    lines.push("Rule#".padEnd(6) + "Name".padEnd(25) + "Source".padEnd(30) + "Destination".padEnd(30) + "Service".padEnd(25) + "Action".padEnd(10) + "Status");
    lines.push("-".repeat(126));
    if (section.rules && section.rules.length > 0) {
      section.rules.forEach((rule, ruleIndex) => {
        const ruleLines = formatRule(rule);
        lines.push(...ruleLines);
        if (rule.inlineRules && rule.inlineRules.length > 0) {
          rule.inlineRules.forEach((inlineRule) => {
            const inlineRuleLines = formatRule(inlineRule, true);
            lines.push(...inlineRuleLines);
          });
        }
        if (ruleIndex < section.rules.length - 1) {
          lines.push("");
        }
      });
    } else {
      lines.push("No rules in this section");
    }
  });
  if (parsedData.groupMode === "as-reference" && parsedData.groupsData && Object.keys(parsedData.groupsData).length > 0) {
    lines.push("");
    lines.push("=".repeat(120));
    lines.push("GROUP REFERENCE TABLE");
    lines.push("=".repeat(120));
    lines.push("");
    Object.values(parsedData.groupsData).forEach((group) => {
      lines.push(`GROUP: ${group.name} (${group.uid})`);
      lines.push("-".repeat(80));
      if (group.members && group.members.length > 0) {
        group.members.forEach((member) => {
          const memberInfo = formatObjectForModel(member);
          lines.push(`  \u2022 ${memberInfo}`);
        });
      } else {
        lines.push("  No members");
      }
      lines.push("");
    });
  }
  return lines.join("\n");
}
function formatRule(rule, isInlineRule = false) {
  const lines = [];
  const indent = isInlineRule ? "  " : "";
  const mainLine = indent + (rule.ruleNumber || "-").toString().padEnd(6) + (rule.name || "-").toString().substring(0, 24).padEnd(25) + formatObjectNoTruncation(rule.sources, 29).padEnd(30) + formatObjectNoTruncation(rule.destinations, 29).padEnd(30) + formatObjectNoTruncation(rule.services, 24).padEnd(25) + (rule.action?.name || rule.action || "-").toString().substring(0, 9).padEnd(10) + (rule.enabled === false ? "DISABLED" : "ENABLED");
  lines.push(mainLine);
  const additionalInfo = getAdditionalInfo(rule);
  if (additionalInfo.length > 0) {
    additionalInfo.forEach((info) => {
      lines.push(indent + "      \u2192 " + info);
    });
  }
  return lines;
}
function formatObjectNoTruncation(obj, maxWidth) {
  if (!obj) return "-";
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "Any";
    if (obj.length === 1 && obj[0].name === "Any") {
      return "Any";
    }
    const items = obj.map((item) => {
      if (!item || !item.name) return "Unknown";
      let display = item.name;
      if (item.type && item.type !== "group") {
        const shortType = getShortType(item.type);
        if (shortType !== item.name) {
          display += ` (${shortType})`;
        }
      }
      if (item.port) {
        display += `:${item.port}`;
      }
      return display;
    });
    const result = items.join(", ");
    if (result.length > maxWidth) {
      return result;
    }
    return result;
  }
  if (obj.name) {
    let display = obj.name;
    if (obj.type && obj.type !== "group") {
      const shortType = getShortType(obj.type);
      if (shortType !== obj.name) {
        display += ` (${shortType})`;
      }
    }
    if (obj.port) {
      display += `:${obj.port}`;
    }
    return display;
  }
  return obj.toString();
}
function getShortType(type) {
  const shortTypes = {
    "service-tcp": "TCP",
    "service-udp": "UDP",
    "service-icmp": "ICMP",
    "service-group": "Svc Grp",
    "access-role": "Role",
    "application-site": "App Site",
    "simple-gateway": "Gateway",
    "security-zone": "Zone",
    "access-layer": "Layer",
    "CpmiHostCkp": "Host",
    "CpmiGatewayCluster": "Cluster",
    "service-other": "Other",
    "network": "Network"
  };
  return shortTypes[type] || type;
}
function getAdditionalInfo(rule) {
  const info = [];
  if (rule.sourceNegate) info.push("Source: NEGATED");
  if (rule.destinationNegate) info.push("Destination: NEGATED");
  if (rule.serviceNegate) info.push("Service: NEGATED");
  if (rule.inlineLayer) {
    info.push(`Inline Layer: ${rule.inlineLayer.name}`);
  }
  if (!rule.enabled) {
    info.push("STATUS: DISABLED");
  }
  if (rule.comments && rule.comments.trim()) {
    info.push(`Comment: ${rule.comments.trim()}`);
  }
  return info;
}
function formatAsModelFriendly(parsedData) {
  const lines = [];
  lines.push(`Check Point Rulebase: ${parsedData.name}`);
  lines.push("=".repeat(120));
  lines.push("");
  parsedData.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      lines.push("");
      lines.push("\u2500".repeat(120));
      lines.push("");
    }
    lines.push(`SECTION ${sectionIndex + 1}: ${section.name}`);
    lines.push(`Rules ${section.from}-${section.to}`);
    if (section.uid) lines.push(`Layer UID: ${section.uid}`);
    if (section.domain) lines.push(`Domain: ${section.domain.name || section.domain}`);
    lines.push("");
    if (section.rules && section.rules.length > 0) {
      section.rules.forEach((rule, ruleIndex) => {
        const actualRuleNumber = rule.ruleNumber || section.from + ruleIndex;
        lines.push(`RULE ${actualRuleNumber}: ${rule.name || "Unnamed Rule"}`);
        lines.push(`  Status: ${rule.enabled === false ? "DISABLED" : "ENABLED"}`);
        lines.push("  Sources:");
        rule.sources.forEach((source) => {
          lines.push(`    - ${formatObjectForModel(source)}`);
        });
        if (rule.sourceNegate) lines.push(`    [SOURCE NEGATED]`);
        lines.push("  Destinations:");
        rule.destinations.forEach((dest) => {
          lines.push(`    - ${formatObjectForModel(dest)}`);
        });
        if (rule.destinationNegate) lines.push(`    [DESTINATION NEGATED]`);
        lines.push("  Services:");
        rule.services.forEach((service) => {
          lines.push(`    - ${formatObjectForModel(service)}`);
        });
        if (rule.serviceNegate) lines.push(`    [SERVICE NEGATED]`);
        lines.push(`  Action: ${rule.action?.name || rule.action || "Unknown"}`);
        lines.push(`  Track: ${rule.track?.name || rule.track || "Unknown"}`);
        if (rule.time && rule.time.length > 0) {
          lines.push("  Time Restrictions:");
          rule.time.forEach((timeObj) => {
            lines.push(`    - ${formatObjectForModel(timeObj)}`);
          });
        }
        if (rule.inlineLayer) {
          lines.push(`  Inline Layer: ${rule.inlineLayer.name}`);
        }
        if (rule.comments && rule.comments.trim()) {
          lines.push(`  Comments: ${rule.comments.trim()}`);
        }
        if (rule.inlineRules && rule.inlineRules.length > 0) {
          lines.push("");
          lines.push(`  INLINE LAYER RULES (${rule.inlineLayer?.name || "Unknown Layer"}):`);
          rule.inlineRules.forEach((inlineRule, inlineIndex) => {
            lines.push(`    RULE ${inlineRule.ruleNumber}: ${inlineRule.name || "Unnamed Rule"}`);
            lines.push(`      Status: ${inlineRule.enabled === false ? "DISABLED" : "ENABLED"}`);
            lines.push("      Sources:");
            inlineRule.sources.forEach((source) => {
              lines.push(`        - ${formatObjectForModel(source)}`);
            });
            lines.push("      Destinations:");
            inlineRule.destinations.forEach((dest) => {
              lines.push(`        - ${formatObjectForModel(dest)}`);
            });
            lines.push("      Services:");
            inlineRule.services.forEach((service) => {
              lines.push(`        - ${formatObjectForModel(service)}`);
            });
            lines.push(`      Action: ${inlineRule.action?.name || inlineRule.action || "Unknown"}`);
            if (inlineRule.comments && inlineRule.comments.trim()) {
              lines.push(`      Comments: ${inlineRule.comments.trim()}`);
            }
            if (inlineIndex < rule.inlineRules.length - 1) {
              lines.push("");
            }
          });
        }
        if (ruleIndex < section.rules.length - 1) {
          lines.push("");
        }
      });
    } else {
      lines.push("  No rules in this section");
    }
  });
  if (parsedData.groupMode === "as-reference" && parsedData.groupsData && Object.keys(parsedData.groupsData).length > 0) {
    lines.push("");
    lines.push("\u2500".repeat(120));
    lines.push("");
    lines.push("GROUP REFERENCE TABLE");
    lines.push("\u2550".repeat(120));
    lines.push("");
    Object.values(parsedData.groupsData).forEach((group) => {
      lines.push(`GROUP: ${group.name}`);
      lines.push(`UID: ${group.uid}`);
      if (group.type) lines.push(`Type: ${group.type}`);
      if (group.comments) lines.push(`Comments: ${group.comments}`);
      lines.push("");
      lines.push("MEMBERS:");
      if (group.members && group.members.length > 0) {
        group.members.forEach((member) => {
          lines.push(`  - ${formatObjectForModel(member)}`);
        });
      } else {
        lines.push("  No members");
      }
      lines.push("");
    });
  }
  return lines.join("\n");
}
function formatObjectForModel(obj) {
  if (!obj || !obj.name) return "Unknown Object";
  const details = [obj.name];
  if (obj.type && obj.type !== "group") {
    details.push(`type: ${obj.type}`);
  }
  if (obj.ipv4Address) {
    details.push(`ip: ${obj.ipv4Address}`);
  }
  if (obj.port) {
    details.push(`port: ${obj.port}`);
  }
  if (obj.protocol) {
    details.push(`protocol: ${obj.protocol}`);
  }
  if (obj.subnetMask) {
    details.push(`mask: ${obj.subnetMask}`);
  }
  if (obj.params && obj.params !== obj.type && obj.params !== "group") {
    details.push(`details: ${obj.params}`);
  }
  return details.join(" | ");
}
function isUuid(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
var ZeroHitsUtil = class {
  constructor(apiCall, gateway, fromDate, toDate) {
    this.success = true;
    this.apiCall = apiCall;
    this.gateway = gateway;
    this.fromDate = fromDate;
    this.toDate = toDate;
  }
  /**
   * Get zero hits rules for a specific rulebase
   */
  async getZeroHitsRules(ruleBase) {
    let offset = 0;
    const limit = 100;
    const result = { rules: [] };
    const hitsSettings = {};
    if (this.gateway) {
      hitsSettings.target = this.gateway;
    }
    if (this.fromDate) {
      hitsSettings["from-date"] = this.fromDate;
    }
    if (this.toDate) {
      hitsSettings["to-date"] = this.toDate;
    }
    while (true) {
      const showAccessRulebase = isUuid(ruleBase) ? {
        name: "show-access-rulebase",
        arguments: {
          uid: ruleBase,
          "show-hits": true,
          "hits-settings": hitsSettings,
          offset,
          limit
        }
      } : {
        name: "show-access-rulebase",
        arguments: {
          name: ruleBase,
          "show-hits": true,
          "hits-settings": hitsSettings,
          offset,
          limit
        }
      };
      const response = await this.callFunction(showAccessRulebase);
      if (!this.success) {
        return [result];
      }
      if (response.api_name !== "show-access-rulebase") {
        return [result];
      }
      if (!response.response) {
        return [result];
      }
      let responseData = response.response;
      if (Array.isArray(responseData) && responseData.length === 2) {
        responseData = responseData[1];
      }
      if (!responseData.rulebase) {
        return [result];
      }
      const rulebase = responseData.rulebase;
      const zeroHitsRules = [];
      await this.getRulesFromResponse(rulebase, zeroHitsRules);
      result.uid = responseData.uid;
      result.name = responseData.name;
      result.rules.push(...zeroHitsRules);
      if (!responseData.total || !responseData.to) {
        return [result];
      }
      offset += limit;
      if (offset >= responseData.total) {
        return [result];
      }
    }
  }
  /**
   * Recursively extract rules with zero hits from response
   */
  async getRulesFromResponse(rulebase, zeroHitsRules) {
    for (const rule of rulebase) {
      if (rule.type === "access-section") {
        await this.getRulesFromResponse(rule.rulebase || [], zeroHitsRules);
      } else {
        const hitsValue = rule.hits?.value;
        if (hitsValue === 0) {
          if (rule.uid && rule.name) {
            zeroHitsRules.push({
              uid: rule.uid,
              name: rule.name,
              rule_number: rule["rule-number"]
            });
          }
        } else {
          if (rule["inline-layer"]) {
            const inlineLayers = await this.getZeroHitsRules(rule["inline-layer"]);
            zeroHitsRules.push({
              uid: rule.uid,
              name: rule.name,
              rule_number: rule["rule-number"],
              inline_layers: inlineLayers
            });
          }
        }
      }
    }
  }
  /**
   * Get rules from access layers within a package
   */
  async getRulesFromAccessLayer(responses, packageData, layers) {
    if (packageData["access-layers"]) {
      for (const accessLayer of packageData["access-layers"]) {
        if (!accessLayer.name || !accessLayer.uid) {
          continue;
        }
        if (layers.has(accessLayer.uid)) {
          continue;
        }
        const showAccessRulebaseResponse = await this.getZeroHitsRules(accessLayer.name);
        layers.add(accessLayer.uid);
        responses.push(...showAccessRulebaseResponse);
      }
    }
  }
  /**
   * Get zero hits rules from policy packages
   */
  async getRulesFromPackages(policyPackage) {
    const responses = [];
    const layers = /* @__PURE__ */ new Set();
    const installedPolicies = await this.getInstalledPackages();
    if (policyPackage) {
      if (!installedPolicies.has(policyPackage)) {
        return [{ policy: policyPackage, status: "not installed" }];
      }
      const showPackage = {
        name: "show-package",
        arguments: {
          name: policyPackage
        }
      };
      const response = await this.callFunction(showPackage);
      if (this.success && response.api_name === "show-package" && response.response) {
        const packageData = response.response;
        const layersResponse = [];
        await this.getRulesFromAccessLayer(layersResponse, packageData, layers);
        responses.push({
          policy: policyPackage,
          status: "installed",
          layers: layersResponse
        });
      }
    } else {
      const showPackages = {
        name: "show-packages",
        arguments: {
          "details-level": "full"
        }
      };
      const response = await this.callFunction(showPackages);
      if (this.success && response.api_name === "show-packages") {
        let responseData = response.response;
        if (Array.isArray(responseData) && responseData.length === 2) {
          responseData = responseData[1];
        }
        if (responseData.packages) {
          const packages = responseData.packages;
          for (const packageData of packages) {
            const policyResponse = {
              policy: packageData.name || "Unknown",
              status: "not installed"
            };
            if (!installedPolicies.has(packageData.name)) {
              policyResponse.status = "not installed";
              responses.push(policyResponse);
              continue;
            }
            const layersResponse = [];
            await this.getRulesFromAccessLayer(layersResponse, packageData, layers);
            policyResponse.status = "installed";
            policyResponse.layers = layersResponse;
            responses.push(policyResponse);
          }
        }
      }
    }
    return responses;
  }
  /**
   * Get installed policy packages from gateways
   */
  async getInstalledPackages() {
    const installedPolicies = /* @__PURE__ */ new Set();
    const showGateways = {
      name: "show-gateways-and-servers",
      arguments: {
        "details-level": "full"
      }
    };
    const response = await this.callFunction(showGateways);
    if (this.success && response.api_name === "show-gateways-and-servers") {
      const gwObjects = response.response?.objects || [];
      const filteredGwObjects = gwObjects.filter((gw) => gw.type !== "checkpoint-host");
      for (const gwObj of filteredGwObjects) {
        if (gwObj.policy && gwObj.policy["access-policy-installed"] && gwObj.policy["access-policy-name"]) {
          installedPolicies.add(gwObj.policy["access-policy-name"]);
        }
      }
    }
    return installedPolicies;
  }
  /**
   * Call API function and handle response
   */
  async callFunction(functionCall) {
    const [status, response] = await this.apiCall(functionCall);
    this.success = this.success && [200, 201, 202].includes(status);
    return {
      api_name: functionCall.name,
      arguments: functionCall.arguments || {},
      response
    };
  }
};
var pkg = JSON.parse(
  (0, import_fs2.readFileSync)((0, import_path.join)((0, import_path.dirname)((0, import_url2.fileURLToPath)(url.pathToFileURL(__filename).toString())), "../package.json"), "utf-8")
);
process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;
var server = new import_mcp.McpServer({
  name: "Check Point Quantum Management",
  description: "MCP server to run commands on a Check Point Management. Use this to view policies and objects for Access, NAT and VPN.",
  version: "1.0.0"
});
var serverModule = createServerModule(
  server,
  Settings,
  pkg,
  APIManagerForAPIKey
);
var runApi = createApiRunner(serverModule);
var SHOW_INSTALLED_POLICIES = `Please show me my installed policies per gateway. In order to see which policies are installed, you need to call show-gateways-and-servers with details-level set to 'full'.
If you already know the gateway name or uid, you can use the show-simple-gateway or show simple-cluster function with details-level set to 'full' to get the installed policy.
`;
var SHOW_POLICIES_AND_RULEBASES = `In order to see which policies Exist, You need to call show-packages with details-level set to 'full'.
If You already know the package name or uid, You can use the show-package function with details-level set to 'full' to get the policy.
I can see the access-layers in the response. You can call show-access-layer with details-level set to 'full' to get the access-layer details.
Finally, to get all the rules in the access-layer, You can call show-access-rulebase to see all the rules in the access-layer.
To show threat-prevention or NAT rules, You can call show-threat-rulebase or show-nat-rulebase respectively.
`;
var SHOW_RULE = `Please show me details for rule {RULE_REF}. In order to get a rule You must first know the package and relevant access-layer.
If You already know the package and access-layer name or uid You can call show-access-rulebase and show-access-rule.
If not, You need to first get the relevant package and access-layer by calling show-packages and show-access-layers.
If there is more that one access-layer or package, You need to ask the user which one to use.
`;
var SOURCE_TO_DESTINATION = `The user is asking to know the possible paths from {SOURCE} to {DESTINATION}. To create a source-to-destination path, You need to gather the following information:
1. The source and destination objects (hosts, networks, etc.)
2. The relevant access layer and rules that apply to the traffic between these objects
3. Any NAT rules that may affect the traffic flow
4. The gateways involved in the path

I can use the show_access_rulebase, show_nat_rulebase, and show_gateways_and_servers functions to gather this information.
Once You have all the necessary details, You can construct the path. You will explain my decision with objects and rules references and also create a visualization of the path if needed.`;
server.prompt(
  "show_gateways_prompt",
  {},
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: SHOW_INSTALLED_POLICIES
        }
      }
    ]
  })
);
server.prompt(
  "show_policies_prompt",
  {},
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: SHOW_POLICIES_AND_RULEBASES
        }
      }
    ]
  })
);
server.prompt(
  "show_rule_prompt",
  {
    rule_name: import_zod.z.string().optional(),
    rule_number: import_zod.z.string().optional()
  },
  (args, extra) => {
    const ruleName = typeof args.rule_name === "string" ? args.rule_name : "";
    const ruleNumber = typeof args.rule_number === "string" ? args.rule_number : "";
    const rule_ref = ruleName || ruleNumber ? `${ruleName}${ruleName && ruleNumber ? " / " : ""}${ruleNumber}` : "the rule";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: SHOW_RULE.replace("{RULE_REF}", rule_ref)
          }
        }
      ]
    };
  }
);
server.prompt(
  "source_to_destination_prompt",
  {
    source: import_zod.z.string().optional(),
    destination: import_zod.z.string().optional()
  },
  (args, extra) => {
    const src = typeof args.source === "string" ? args.source : "All sources";
    const dst = typeof args.destination === "string" ? args.destination : "all destinations";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: SOURCE_TO_DESTINATION.replace("{SOURCE}", src).replace("{DESTINATION}", dst)
          }
        }
      ]
    };
  }
);
server.tool(
  "show_access_rulebase",
  "Show the access rulebase for a given name or uid. Either name or uid is required, the other can be empty. By default, returns a formatted table with parsing capabilities. Set show_raw=true to get the raw JSON response.",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    package: import_zod.z.string().optional(),
    show_raw: import_zod.z.boolean().optional().default(false),
    format: import_zod.z.enum(["table", "model-friendly"]).optional().default("table"),
    expand_groups: import_zod.z.boolean().optional().default(false),
    group_mode: import_zod.z.enum(["in-rule", "as-reference"]).optional().default("as-reference")
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") {
      params.name = args.name;
    }
    if (typeof args.uid === "string" && args.uid.trim() !== "") {
      params.uid = args.uid;
    }
    if (typeof args.package === "string" && args.package.trim() !== "") {
      params.package = args.package;
    }
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi("POST", "show-access-rulebase", params, extra);
    const showRaw = typeof args.show_raw === "boolean" ? args.show_raw : false;
    if (showRaw) {
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
    try {
      const name = typeof args.name === "string" && args.name.trim() !== "" ? args.name : void 0;
      const uid = typeof args.uid === "string" && args.uid.trim() !== "" ? args.uid : void 0;
      if (!name && !uid) {
        return {
          content: [{
            type: "text",
            text: "Error: Either name or uid parameter is required to identify the rulebase."
          }]
        };
      }
      const format = args.format;
      const expandGroups = typeof args.expand_groups === "boolean" ? args.expand_groups : false;
      const groupMode = args.group_mode || "as-reference";
      const parsedData = await parseRulebaseWithInlineLayers(
        resp,
        apiManager,
        expandGroups,
        groupMode
      );
      let formattedOutput;
      if (format === "model-friendly") {
        formattedOutput = formatAsModelFriendly(parsedData);
      } else {
        formattedOutput = formatAsTable(parsedData);
      }
      const summary = `
Rulebase Summary:
- Name: ${parsedData.name}
- Sections: ${parsedData.sections.length}
- Total Rules: ${parsedData.sections.reduce((total, section) => total + section.rules.length, 0)}
- Inline Layers: ${expandGroups ? "Supported" : "Not expanded"}
- Group Expansion: ${expandGroups ? `Enabled (${groupMode} mode)` : "Disabled"}

${formattedOutput}`;
      return {
        content: [{
          type: "text",
          text: summary
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error parsing rulebase: ${errorMessage}`
        }]
      };
    }
  }
);
server.tool(
  "show_hosts",
  "Show the hosts in the management server.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    show_membership: import_zod.z.boolean().optional().default(true)
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.filter === "string" && args.filter.trim() !== "") params.filter = args.filter;
    if (typeof args.limit === "number") params.limit = args.limit;
    if (typeof args.offset === "number") params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    if (typeof args.show_membership === "boolean") params.show_membership = args.show_membership;
    const apiManager = SessionContext.getAPIManager(serverModule, extra);
    const resp = await apiManager.callApi("POST", "show-hosts", params);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_access_rule",
  "Show a specific rule in the access control layer. Set requested rule by uid, name or rule-number (at least one is required). You must always specify the layer.",
  {
    name: import_zod.z.string().optional(),
    layer: import_zod.z.string(),
    rule_number: import_zod.z.number().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional(),
    show_as_ranges: import_zod.z.boolean().optional().default(false),
    show_hits: import_zod.z.boolean().optional().default(false)
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") {
      params.name = args.name;
    }
    if (typeof args.layer === "string" && args.layer.trim() !== "") {
      params.layer = args.layer;
    }
    if (typeof args.rule_number === "number") {
      params.rule_number = args.rule_number;
    }
    if (typeof args.uid === "string" && args.uid.trim() !== "") {
      params.uid = args.uid;
    }
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") {
      params.details_level = args.details_level;
    }
    if (typeof args.show_as_ranges === "boolean") {
      params.show_as_ranges = args.show_as_ranges;
    }
    if (typeof args.show_hits === "boolean") {
      params.show_hits = args.show_hits;
    }
    const resp = await runApi("POST", "show-access-rule", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_access_layer",
  "Show an access layer object by name or UID (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") {
      params.name = args.name;
    }
    if (typeof args.uid === "string" && args.uid.trim() !== "") {
      params.uid = args.uid;
    }
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") {
      params.details_level = args.details_level;
    }
    const resp = await runApi("POST", "show-access-layer", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_access_layers",
  "Show all access layers, with optional filtering and detail level.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional(),
    offset: import_zod.z.number().optional(),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.filter === "string" && args.filter.trim() !== "") params.filter = args.filter;
    if (typeof args.limit === "number") params.limit = args.limit;
    if (typeof args.offset === "number") params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    if (Array.isArray(args.domains_to_process) && args.domains_to_process.length > 0) params.domains_to_process = args.domains_to_process;
    const resp = await runApi("POST", "show-access-layers", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_nat_rulebase",
  "Show the NAT rulebase of a given package.",
  {
    package: import_zod.z.string(),
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional(),
    offset: import_zod.z.number().optional(),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    dereference_group_members: import_zod.z.boolean().optional().default(false),
    show_membership: import_zod.z.boolean().optional().default(false)
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.package === "string" && args.package.trim() !== "") params.package = args.package;
    if (typeof args.filter === "string" && args.filter.trim() !== "") params.filter = args.filter;
    if (typeof args.limit === "number") params.limit = args.limit;
    if (typeof args.offset === "number") params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    if (typeof args.dereference_group_members === "boolean") params.dereference_group_members = args.dereference_group_members;
    if (typeof args.show_membership === "boolean") params.show_membership = args.show_membership;
    const resp = await runApi("POST", "show-nat-rulebase", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_access_section",
  "Show an access section by name, UID or layer (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    layer: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.layer === "string" && args.layer.trim() !== "") params.layer = args.layer;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    const resp = await runApi("POST", "show-access-section", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_nat_section",
  "Show a NAT section by name or UID and layer (at least one is required). You must always specify the package.",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    layer: import_zod.z.string().optional(),
    package: import_zod.z.string(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.layer === "string" && args.layer.trim() !== "") params.layer = args.layer;
    if (typeof args.package === "string" && args.package.trim() !== "") params.package = args.package;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    const resp = await runApi("POST", "show-nat-section", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_vpn_community_star",
  "Show a VPN Community Star object by name or UID (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    const resp = await runApi("POST", "show-vpn-community-star", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_vpn_communities_star",
  "Show all VPN Community Star objects, with optional filtering and detail level.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional(),
    offset: import_zod.z.number().optional(),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : void 0;
    const offset = typeof args.offset === "number" ? args.offset : void 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const resp = await runApi("POST", "show-vpn-communities-star", {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process
    }, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_vpn_community_meshed",
  "Show a VPN Community Meshed object by name or UID (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    const resp = await runApi("POST", "show-vpn-community-meshed", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_vpn_communities_meshed",
  "Show all VPN Community Meshed objects, with optional filtering and detail level.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional(),
    offset: import_zod.z.number().optional(),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : void 0;
    const offset = typeof args.offset === "number" ? args.offset : void 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const resp = await runApi("POST", "show-vpn-communities-meshed", {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process
    }, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_vpn_community_remote_access",
  "Show a VPN Community Remote Access object by name or UID (at least one is required).",
  {
    uid: import_zod.z.string().optional(),
    name: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params.details_level = args.details_level;
    const resp = await runApi("POST", "show-vpn-community-remote-access", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_vpn_communities_remote_access",
  "Show all VPN Community Remote Access objects, with optional filtering and detail level.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional(),
    offset: import_zod.z.number().optional(),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : void 0;
    const offset = typeof args.offset === "number" ? args.offset : void 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const resp = await runApi("POST", "show-vpn-communities-remote-access", {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process
    }, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_gateways_and_servers",
  "Retrieve multiple gateway and server objects with optional filtering and pagination. Use this to get the currently installed policies only gateways.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-gateways-and-servers", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_simple_gateway",
  "Retrieve a simple gateway object by name or UID. (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params["details-level"] = args.details_level;
    const resp = await runApi("POST", "show-simple-gateway", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_simple_gateways",
  "Retrieve multiple simple gateway objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-simple-gateways", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_lsm_clusters",
  "Retrieve multiple LSM cluster objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-lsm-clusters", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_cluster_member",
  "Retrieve a cluster member object by or UID",
  {
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const uid = typeof args.uid === "string" ? args.uid : "";
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const params = {};
    if (uid) params.uid = uid;
    if (details_level) params["details-level"] = details_level;
    const resp = await runApi("POST", "show-cluster-member", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_cluster_members",
  "Retrieve multiple cluster member objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-cluster-members", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_lsm_gateway",
  "Retrieve an LSM gateway object by name or UID. (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params["details-level"] = args.details_level;
    const resp = await runApi("POST", "show-lsm-gateway", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_simple_clusters",
  "Retrieve multiple simple cluster objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-simple-clusters", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_simple_cluster",
  "Retrieve a simple cluster object by name or UID (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params["details-level"] = args.details_level;
    const resp = await runApi("POST", "show-simple-cluster", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_lsm_gateways",
  "Retrieve multiple LSM gateway objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-lsm-gateways", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_lsm_cluster",
  "Retrieve an LSM cluster object by name or UID (at least one is required).",
  {
    name: import_zod.z.string().optional(),
    uid: import_zod.z.string().optional(),
    details_level: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.name === "string" && args.name.trim() !== "") params.name = args.name;
    if (typeof args.uid === "string" && args.uid.trim() !== "") params.uid = args.uid;
    if (typeof args.details_level === "string" && args.details_level.trim() !== "") params["details-level"] = args.details_level;
    const resp = await runApi("POST", "show-lsm-cluster", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_groups",
  "Retrieve multiple group objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_as_ranges: import_zod.z.boolean().optional().default(false),
    dereference_group_members: import_zod.z.boolean().optional().default(false),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_as_ranges = typeof args.show_as_ranges === "boolean" ? args.show_as_ranges : false;
    const dereference_group_members = typeof args.dereference_group_members === "boolean" ? args.dereference_group_members : false;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = {
      limit,
      offset,
      "show-as-ranges": show_as_ranges,
      "dereference-group-members": dereference_group_members,
      "show-membership": show_membership
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-groups", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_services_tcp",
  "Retrieve multiple TCP service objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-services-tcp", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_application_sites",
  "Retrieve multiple application site objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-application-sites", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_application_site_groups",
  "Retrieve multiple application site group objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    dereference_members: import_zod.z.boolean().optional().default(false),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const dereference_members = typeof args.dereference_members === "boolean" ? args.dereference_members : false;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "dereference-members": dereference_members, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-application-site-groups", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_services_udp",
  "Retrieve multiple UDP service objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-services-udp", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_wildcards",
  "Retrieve multiple wildcard objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-wildcards", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_security_zones",
  "Retrieve multiple security zone objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-security-zones", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_tags",
  "Retrieve multiple tag objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-tags", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_address_ranges",
  "Retrieve multiple address range objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-address-ranges", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_application_site_categories",
  "Retrieve multiple application site category objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-application-site-categories", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_dynamic_objects",
  "Retrieve multiple dynamic objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-dynamic-objects", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_services_icmp6",
  "Retrieve multiple ICMPv6 service objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-services-icmp6", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_services_icmp",
  "Retrieve multiple ICMP service objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset, "show-membership": show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-services-icmp", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_service_groups",
  "Retrieve multiple service group objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    show_as_ranges: import_zod.z.boolean().optional().default(false),
    dereference_members: import_zod.z.boolean().optional().default(false),
    show_membership: import_zod.z.boolean().optional().default(false),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const show_as_ranges = typeof args.show_as_ranges === "boolean" ? args.show_as_ranges : false;
    const dereference_members = typeof args.dereference_members === "boolean" ? args.dereference_members : false;
    const show_membership = typeof args.show_membership === "boolean" ? args.show_membership : false;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = {
      limit,
      offset,
      "show-as-ranges": show_as_ranges,
      "dereference-members": dereference_members,
      "show-membership": show_membership
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-service-groups", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_multicast_address_ranges",
  "Retrieve multiple multicast address range objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-multicast-address-ranges", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_dns_domains",
  "Retrieve multiple DNS domain objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-dns-domains", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_time_groups",
  "Retrieve multiple time group objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-time-groups", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_access_point_names",
  "Retrieve multiple access point name objects with optional filtering and pagination.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const params = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    const resp = await runApi("POST", "show-access-point-names", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_objects",
  "Retrieve multiple generic objects with filtering and pagination. Can use type (e.g host, service-tcp, network, address-range...) to get objects of a certain type.",
  {
    uids: import_zod.z.array(import_zod.z.string()).optional(),
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional().default(50),
    offset: import_zod.z.number().optional().default(0),
    order: import_zod.z.array(import_zod.z.string()).optional(),
    details_level: import_zod.z.string().optional(),
    domains_to_process: import_zod.z.array(import_zod.z.string()).optional(),
    type: import_zod.z.string().optional()
  },
  async (args, extra) => {
    const uids = Array.isArray(args.uids) ? args.uids : void 0;
    const filter = typeof args.filter === "string" ? args.filter : "";
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const offset = typeof args.offset === "number" ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : void 0;
    const details_level = typeof args.details_level === "string" ? args.details_level : void 0;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process : void 0;
    const type = typeof args.type === "string" ? args.type : void 0;
    const params = { limit, offset };
    if (uids) params.uids = uids;
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params["details-level"] = details_level;
    if (domains_to_process) params["domains-to-process"] = domains_to_process;
    if (type) params.type = type;
    const resp = await runApi("POST", "show-objects", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "show_object",
  "Retrieve a generic object by UID.",
  {
    uid: import_zod.z.string()
  },
  async (args, extra) => {
    const uid = args.uid;
    const params = {};
    params.uid = uid;
    params.details_level = "full";
    const resp = await runApi("POST", "show-object", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
server.tool(
  "find_zero_hits_rules",
  "Find rules with zero hits (unused rules) in access rulebases. Can analyze specific rulebases, policy packages, or all installed policies. Useful for identifying unused security rules that may be candidates for removal.",
  {
    rulebase_name: import_zod.z.string().optional(),
    rulebase_uid: import_zod.z.string().optional(),
    policy_package: import_zod.z.string().optional(),
    gateway: import_zod.z.string().optional(),
    from_date: import_zod.z.string().optional(),
    to_date: import_zod.z.string().optional(),
    format: import_zod.z.enum(["detailed", "summary"]).optional().default("detailed")
  },
  async (args, extra) => {
    try {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const apiCallWrapper = async (functionCall) => {
        const response = await apiManager.callApi("POST", functionCall.name, functionCall.arguments, extra);
        return [200, response];
      };
      const gateway = typeof args.gateway === "string" ? args.gateway : void 0;
      const fromDate = typeof args.from_date === "string" ? args.from_date : void 0;
      const toDate = typeof args.to_date === "string" ? args.to_date : void 0;
      const format = args.format || "detailed";
      const zeroHitsUtil = new ZeroHitsUtil(apiCallWrapper, gateway, fromDate, toDate);
      let results;
      if (args.rulebase_name || args.rulebase_uid) {
        const rulebaseIdentifier = args.rulebase_name || args.rulebase_uid;
        results = await zeroHitsUtil.getZeroHitsRules(rulebaseIdentifier);
      } else if (args.policy_package) {
        results = await zeroHitsUtil.getRulesFromPackages(args.policy_package);
      } else {
        results = await zeroHitsUtil.getRulesFromPackages();
      }
      if (format === "summary") {
        let totalZeroHitRules = 0;
        let summary = "";
        if (Array.isArray(results) && results.length > 0 && "policy" in results[0]) {
          summary = "Zero Hits Rules Summary by Policy Package:\n\n";
          for (const policyResult of results) {
            summary += `Policy: ${policyResult.policy} (${policyResult.status})
`;
            if (policyResult.layers) {
              for (const layer of policyResult.layers) {
                summary += `  Layer: ${layer.name || "Unknown"} - ${layer.rules.length} zero-hit rules
`;
                totalZeroHitRules += layer.rules.length;
              }
            }
            summary += "\n";
          }
        } else {
          summary = "Zero Hits Rules Summary:\n\n";
          for (const rulebase of results) {
            summary += `Rulebase: ${rulebase.name || "Unknown"} - ${rulebase.rules.length} zero-hit rules
`;
            totalZeroHitRules += rulebase.rules.length;
          }
        }
        summary += `
Total zero-hit rules found: ${totalZeroHitRules}`;
        return {
          content: [{
            type: "text",
            text: summary
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error finding zero hits rules: ${errorMessage}`
        }]
      };
    }
  }
);
server.tool(
  "show_networks",
  "Show all networks, with optional filtering and detail level.",
  {
    filter: import_zod.z.string().optional(),
    limit: import_zod.z.number().optional(),
    offset: import_zod.z.number().optional(),
    order: import_zod.z.array(import_zod.z.string()).optional()
  },
  async (args, extra) => {
    const params = {};
    if (typeof args.filter === "string" && args.filter.trim() !== "") params.filter = args.filter;
    if (typeof args.limit === "number") params.limit = args.limit;
    if (typeof args.offset === "number") params.offset = args.offset;
    if (Array.isArray(args.order) && args.order.length > 0) params.order = args.order;
    const resp = await runApi("POST", "show-networks", params, extra);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);
var main = async () => {
  await launchMCPServer(
    (0, import_path.join)((0, import_path.dirname)((0, import_url2.fileURLToPath)(url.pathToFileURL(__filename).toString())), "server-config.json"),
    serverModule
  );
};
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  server
});
