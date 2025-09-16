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

// packages/gaia/dist/index.js
var index_exports = {};
__export(index_exports, {
  server: () => server
});
module.exports = __toCommonJS(index_exports);
var import_commander = require("commander");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_streamableHttp = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
var import_fs = __toESM(require("fs"), 1);
var import_http = __toESM(require("http"), 1);
var import_crypto = require("crypto");
var import_http2 = require("http");
var import_url = require("url");
var import_child_process = require("child_process");
var import_util = require("util");
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_axios = __toESM(require("axios"), 1);
var import_https = __toESM(require("https"), 1);
var import_axios2 = __toESM(require("axios"), 1);
var import_zod = require("zod");
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
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
  const server2 = import_http.default.createServer(async (req, res) => {
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
var init_launcher = __esm({
  "../mcp-utils/dist/launcher.js"() {
    "use strict";
  }
});
var SettingsManager;
var init_settings_manager = __esm({
  "../mcp-utils/dist/settings-manager.js"() {
    "use strict";
    SettingsManager = class _SettingsManager {
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
  }
});
var APIManagerFactory;
var init_api_manager_factory = __esm({
  "../mcp-utils/dist/api-manager-factory.js"() {
    "use strict";
    APIManagerFactory = class {
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
  }
});
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
          this.server = (0, import_http2.createServer)((req, res) => {
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
var _a;
var SessionContext;
var init_session_context = __esm({
  "../mcp-utils/dist/session-context.js"() {
    "use strict";
    SessionContext = class {
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
  }
});
var DEFAULT_SESSION_TIMEOUT_MS;
var SessionManager;
var init_session_manager = __esm({
  "../mcp-utils/dist/session-manager.js"() {
    "use strict";
    init_session_context();
    DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
    SessionManager = class {
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
  }
});
function getHeaderValue(headers, key) {
  const value = headers[key] || headers[key.toUpperCase()] || headers[key.toLowerCase()];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
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
var init_server_utils = __esm({
  "../mcp-utils/dist/server-utils.js"() {
    "use strict";
    init_api_manager_factory();
    init_session_context();
    init_session_manager();
    init_settings_manager();
  }
});
var init_dist = __esm({
  "../mcp-utils/dist/index.js"() {
    "use strict";
    init_launcher();
    init_settings_manager();
    init_api_manager_factory();
    init_session_context();
    init_session_manager();
    init_server_utils();
    init_ui_dialog();
  }
});
function getMainPackageUserAgent() {
  if (process.env.CP_MCP_MAIN_PKG) {
    if (process.env.CP_MCP_MAIN_PKG.includes("quantum-management-mcp")) {
      return "mgmt-mcp";
    }
  }
  return "Check Point MCP API Client";
}
var TokenType;
var ClientResponse;
var APIClientBase;
var OnPremAPIClient;
var init_api_client = __esm({
  "../infra/dist/api-client.js"() {
    "use strict";
    (function(TokenType2) {
      TokenType2["API_KEY"] = "API_KEY";
      TokenType2["CI_TOKEN"] = "CI_TOKEN";
    })(TokenType || (TokenType = {}));
    ClientResponse = class {
      constructor(status, response) {
        this.status = status;
        this.response = response;
      }
    };
    APIClientBase = class {
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
    OnPremAPIClient = class extends APIClientBase {
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
  }
});
var init_string_utils = __esm({
  "../infra/dist/string-utils.js"() {
    "use strict";
  }
});
var init_api_manager = __esm({
  "../infra/dist/api-manager.js"() {
    "use strict";
    init_api_client();
    init_string_utils();
  }
});
var init_settings = __esm({
  "../infra/dist/settings.js"() {
    "use strict";
    init_string_utils();
    init_dist();
  }
});
var init_external_user_token_manager = __esm({
  "../infra/dist/external-user-token-manager.js"() {
    "use strict";
  }
});
var init_dist2 = __esm({
  "../infra/dist/index.js"() {
    "use strict";
    init_api_client();
    init_api_manager();
    init_settings();
    init_string_utils();
    init_external_user_token_manager();
  }
});
var gaia_api_client_exports = {};
__export2(gaia_api_client_exports, {
  GaiaApiClient: () => GaiaApiClient
});
var GaiaApiClient;
var init_gaia_api_client = __esm({
  "src/gaia-api-client.ts"() {
    "use strict";
    init_dist2();
    GaiaApiClient = class extends OnPremAPIClient {
      constructor(connection) {
        super(
          void 0,
          connection.gatewayIp.trim(),
          connection.port.toString(),
          connection.user,
          connection.password
        );
        this.connection = connection;
      }
      /**
       * Override getHost() to use Gaia API path with configurable port
       */
      getHost() {
        return `https://${this.connection.gatewayIp}:${this.connection.port}/gaia_api`;
      }
      /**
       * Get connection info for logging
       */
      getConnectionInfo() {
        return `${this.connection.gatewayIp}:${this.connection.port}`;
      }
      // Override inherited methods to ensure TypeScript recognizes them
      async login() {
        return super.login();
      }
      async callApi(method, uri, data = {}, params) {
        return super.callApi(method, uri, data, params);
      }
    };
  }
});
init_dist();
init_dist2();
init_dist();
var Settings = class _Settings {
  constructor({
    verbose = process.env.VERBOSE === "true"
  } = {}) {
    this.verbose = false;
    this.verbose = verbose || false;
  }
  validate() {
    return true;
  }
  static fromArgs(options) {
    console.error("Settings fromArgs called with:", options);
    return new _Settings({
      verbose: options.verbose
    });
  }
  static fromHeaders(headers) {
    const verbose = getHeaderValue(headers, "VERBOSE") === "true";
    console.error("Settings fromHeaders called");
    return new _Settings({
      verbose
    });
  }
};
init_gaia_api_client();
var GaiaAPIManager = class _GaiaAPIManager {
  constructor(connection) {
    this.gaiaClient = null;
    this.connection = connection;
  }
  /**
   * Create API manager from connection details
   */
  static create(connection) {
    return new _GaiaAPIManager(connection);
  }
  async initializeClient() {
    if (!this.gaiaClient) {
      this.gaiaClient = new GaiaApiClient(this.connection);
      await this.gaiaClient.login();
      console.error(`GAIA client initialized for ${this.gaiaClient.getConnectionInfo()}`);
    }
  }
  async callApi(method, uri, data = {}) {
    if (!this.gaiaClient) {
      await this.initializeClient();
    }
    return await this.gaiaClient.callApi(method, uri, data);
  }
  /**
   * Get connection info for logging
   */
  getConnectionInfo() {
    return `${this.connection.gatewayIp}:${this.connection.port}`;
  }
};
init_dist();
async function getGaiaConnection(gatewayIp, port, extra) {
  let connectionDetails;
  if (!gatewayIp) {
    const gatewayResult = await SessionContext.getOrPromptUserData({
      cacheKey: "default_gateway_connection",
      dialogTitle: "GAIA Gateway Connection",
      dialogMessage: "Please provide the gateway connection details:",
      customFields: [
        {
          name: "gateway_ip",
          label: "Gateway IP Address",
          type: "text",
          placeholder: "e.g., 192.168.1.1",
          required: true
        },
        {
          name: "port",
          label: "Port",
          type: "number",
          placeholder: "443",
          defaultValue: "443",
          required: true
        }
      ],
      expirationMinutes: 60
      // Cache gateway selection for 1 hour
    }, extra);
    if (gatewayResult.cancelled) {
      throw new Error("Gateway connection details cancelled by user");
    }
    connectionDetails = {
      gatewayIp: gatewayResult.data.gateway_ip,
      port: parseInt(gatewayResult.data.port) || 443
    };
  } else {
    connectionDetails = {
      gatewayIp,
      port: port || 443
    };
  }
  const connectionKey = `${connectionDetails.gatewayIp}:${connectionDetails.port}`;
  const cacheKey = `gaia_creds_${connectionKey.replace(/[:.]/g, "_")}`;
  const credentialsResult = await SessionContext.getOrPromptUserData({
    cacheKey,
    dialogTitle: `GAIA Authentication`,
    dialogMessage: `Please provide credentials for gateway: ${connectionKey}`,
    expirationMinutes: 15,
    // 15 minutes as suggested
    customFields: [
      {
        name: "address",
        label: "Address",
        type: "text",
        defaultValue: connectionKey,
        // Pre-fill with gateway:port
        required: true,
        placeholder: connectionKey
      },
      {
        name: "user",
        label: "Username",
        type: "text",
        required: true,
        placeholder: "User"
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        placeholder: "Password"
      }
    ]
  }, extra);
  if (credentialsResult.cancelled) {
    throw new Error("Authentication cancelled by user");
  }
  return {
    gatewayIp: connectionDetails.gatewayIp,
    port: connectionDetails.port,
    user: credentialsResult.data.user,
    password: credentialsResult.data.password
  };
}
function clearGaiaCredentials(gatewayIp, port, extra) {
  const connectionKey = `${gatewayIp}:${port}`;
  const cacheKey = `gaia_creds_${connectionKey.replace(/[:.]/g, "_")}`;
  SessionContext.clearUserData(cacheKey, extra);
}
function clearDefaultGateway(extra) {
  SessionContext.clearUserData("default_gateway_connection", extra);
}
async function getApiManagerWithDialog(gatewayIp, port, extra) {
  const connection = await getGaiaConnection(gatewayIp, port, extra);
  return {
    async callApi(method, uri, data = {}) {
      const { GaiaApiClient: GaiaApiClient2 } = await Promise.resolve().then(() => (init_gaia_api_client(), gaia_api_client_exports));
      const client = new GaiaApiClient2(connection);
      await client.login();
      return await client.callApi(method, uri, data);
    }
  };
}
var pkg = JSON.parse(
  (0, import_fs2.readFileSync)((0, import_path.join)((0, import_path.dirname)((0, import_url2.fileURLToPath)(url.pathToFileURL(__filename).toString())), "../package.json"), "utf-8")
);
process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;
var server = new import_mcp.McpServer(
  {
    name: "quantum-gaia",
    version: "1.0.0",
    description: `Check Point GAIA MCP Server - Provides networking, network management and interface configuration tools for GAIA OS.

**Gateway Connection (all tools):**
- **gateway_ip**: Gateway IP address to connect to. If not provided, an interactive dialog will prompt for the IP address.
- **port**: Gateway port (default: 443)
- Credentials are cached per gateway for the session with independent authentication per gateway
- Interactive authentication prompts appear when credentials are needed

**Cluster & Virtual Systems (most tools):**
- **member_id**: Cluster member ID for targeting specific cluster members in clustered environments
- **virtual_system_id**: Virtual System ID for virtual system (VSNext) environments`
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
var serverModule = createServerModule(
  server,
  Settings,
  pkg,
  GaiaAPIManager
);
server.tool(
  "show_dns",
  "Show DNS configuration including DNS servers, domain settings, and resolution status. Returns current DNS configuration and operational state. Supports virtual system environments.",
  {
    virtual_system_id: import_zod.z.number().int().optional(),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-dns", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_proxy",
  "Show HTTP proxy configuration. Returns proxy server settings including host, port, and connection parameters.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-proxy", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_dhcp",
  "Show DHCP (IPv4) server configuration. Returns DHCP service settings including subnets, DNS servers, and client configurations.",
  {
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-dhcp-server", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_dhcp6",
  "Show complete DHCPv6 information including both server status and configuration details. Combines show-dhcp6-server and show-dhcp6-config in a single call.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const [serverResponse, configResponse] = await Promise.all([
        apiManager.callApi("POST", "show-dhcp6-server", params),
        apiManager.callApi("POST", "show-dhcp6-config", params)
      ]);
      const combinedResult = {
        dhcp6_server: serverResponse,
        dhcp6_config: configResponse
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(combinedResult, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }]
      };
    }
  }
);
server.tool(
  "show_arp",
  "Show ARP (Address Resolution Protocol) settings and table entries. Returns ARP configuration and learned MAC address mappings.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-arp", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_date_time",
  "Show complete date and time information including NTP configuration, current time/date settings, and available timezones. Combines show-ntp, show-time-and-date, and show-timezones in a single comprehensive call.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const [ntpResponse, timeResponse, timezonesResponse] = await Promise.all([
        apiManager.callApi("POST", "show-ntp", params),
        apiManager.callApi("POST", "show-time-and-date", params),
        apiManager.callApi("POST", "show-timezones", params)
      ]);
      const combinedResult = {
        ntp_configuration: ntpResponse,
        current_time_date: timeResponse,
        available_timezones: timezonesResponse
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(combinedResult, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }]
      };
    }
  }
);
server.tool(
  "show_static_mroutes",
  "Show configuration of all static multicast routes with optional filtering and pagination. Returns static multicast route entries including destinations, interfaces, and routing priorities for multicast traffic forwarding.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-static-mroutes", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_pim_summary",
  "Show IPv4 PIM (Protocol Independent Multicast) summary status information. Provides overview of IPv4 multicast routing configuration and operational state.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-pim-summary", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_ipv6_pim_summary",
  "Show IPv6 PIM (Protocol Independent Multicast) summary status information. Provides overview of IPv6 multicast routing configuration and operational state.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-ipv6-pim-summary", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_igmp_interfaces",
  "Show IGMP (Internet Group Management Protocol) state information for all interfaces with optional pagination. Returns IGMP configuration and status for multicast group management.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-igmp-interfaces", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_igmp_groups",
  "Show IGMP groups using group type or interface name as filters with optional pagination. Returns IGMP multicast group information and membership details.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    type: import_zod.z.enum(["static", "local", "all"]).optional().default("all"),
    interface: import_zod.z.string().optional().default("all"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        type: args.type
      };
      if (typeof args.interface === "string" && args.interface.trim() !== "") {
        params.interface = args.interface.trim();
      }
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-igmp-groups", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_static_routes",
  "Show configuration of all static routes with optional filtering and pagination. Returns static route entries including destinations, gateways, and routing priorities.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    virtual_system_id: import_zod.z.number().int().optional(),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-static-routes", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes",
  "Show active routes from the gateway routing table with optional filtering and pagination.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_aggregate",
  "Show active aggregate routes from the gateway routing table with optional filtering and pagination. Returns route aggregation information including summarized network prefixes.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-aggregate", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_bgp",
  "Show BGP routes in the routing table with optional filtering and pagination. Returns BGP learned routes with path attributes and routing information.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-bgp", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_ospf",
  "Show active OSPF routes from the gateway routing table with optional filtering and pagination. Returns OSPF learned routes with path information and routing details.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-ospf", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_static",
  "Show active static routes from the gateway routing table with optional filtering and pagination. Returns static route entries that are currently active in the routing table.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-static", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_rip",
  "Show active RIP routes from the gateway routing table with optional filtering and pagination. Returns RIP learned routes with distance vector routing information.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-rip", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_kernel",
  "Show active kernel routes from the gateway routing table with optional filtering and pagination. Returns kernel-level routing information and system-generated routes.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-kernel", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routes_direct",
  "Show active interface (direct) routes from the gateway routing table with optional filtering and pagination. Returns directly connected network routes and interface-based routing information.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    address_family: import_zod.z.enum(["inet", "inet6"]).optional().default("inet"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        "address-family": args.address_family
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routes-direct", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_groups",
  "Show BGP peer groups configuration. Returns information about BGP peer groups including AS numbers, enabled status, and group configurations.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-groups", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_paths",
  "Show BGP path information. Returns BGP path attributes and routing path details for BGP routes.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-paths", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_peers",
  "Show BGP peers configuration and state information. Displays configuration and state information for all BGP peers. Only supported on GAIA versions R82+.",
  {
    filter: import_zod.z.enum(["all", "established"]).optional().default("all"),
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        filter: args.filter,
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-peers", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_routes_in",
  "Show BGP routes received from peers (inbound routes). Displays routes and their path attributes received from BGP peer(s). Only supported on GAIA versions R82+.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    peer: import_zod.z.string().optional().default("all"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        peer: args.peer || "all"
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-routes-in", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_routes_out",
  "Show BGP routes sent to peers (outbound routes). Displays routes and their path attributes sent to BGP peer(s).",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    peer: import_zod.z.string().optional().default("all"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        peer: args.peer || "all"
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-routes-out", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_routemaps",
  "Show BGP route maps configuration. Returns BGP route map policies and their configurations for route filtering and manipulation.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-routemaps", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bgp_summary",
  "Show BGP summary information. Returns overall BGP status, peer summary, and general BGP operational information.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bgp-summary", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_configuration_bgp",
  "Show BGP configuration. Returns the complete BGP configuration including AS numbers, routing domains, peers, and BGP-specific settings.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-configuration-bgp", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_ospf_summary",
  "Show OSPF summary information. Returns comprehensive OSPF operational status including areas, LSAs, timers, and router capabilities.",
  {
    protocol_instance: import_zod.z.number().int().min(1).max(65535).optional().default(1),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.protocol_instance === "number") {
        params["protocol-instance"] = args.protocol_instance;
      } else {
        params["protocol-instance"] = "default";
      }
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-ospf-summary", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_pbr_rules",
  "Show Policy Based Routing (PBR) rules configuration. Returns list of configured PBR rules with priority-based sorting.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-pbr-rules", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_pbr_tables",
  "Show Policy Based Routing (PBR) tables configuration. Returns list of configured PBR table names with sorting options.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    virtual_system_id: import_zod.z.number().int().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-pbr-tables", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_isis_info",
  "Show IS-IS information including hostnames, interfaces, or neighbors. Returns IS-IS operational data based on the specified information type.",
  {
    info_type: import_zod.z.string().trim().transform((val) => val.toLowerCase()).refine((val) => ["hostnames", "interfaces", "neighbors"].includes(val), {
      message: "Info type must be 'hostnames', 'interfaces', or 'neighbors'"
    }),
    protocol_instance: import_zod.z.number().int().min(1).max(65535).optional().default(1),
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.protocol_instance === "number") {
        params["protocol-instance"] = args.protocol_instance;
      } else {
        params["protocol-instance"] = "default";
      }
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      let apiEndpoint;
      switch (args.info_type) {
        case "hostnames":
          apiEndpoint = "show-isis-hostnames";
          break;
        case "interfaces":
          apiEndpoint = "show-isis-interfaces";
          break;
        case "neighbors":
          apiEndpoint = "show-isis-neighbors";
          break;
        default:
          throw new Error("Invalid info_type specified");
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", apiEndpoint, params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_inbound_route_filter_bgp_policy",
  "Show Inbound Route Filter configuration for BGP.",
  {
    policy_id: import_zod.z.union([
      import_zod.z.literal("all"),
      import_zod.z.number().int().min(1).max(1024)
    ]).optional().default("all"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        "policy-id": args.policy_id || "all"
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-inbound-route-filter-bgp-policy", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_inbound_route_filter_rip",
  "Show Inbound Route Filter configuration for RIP.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-inbound-route-filter-rip", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_inbound_route_filter_ospf",
  "Show Inbound Route Filter configuration for OSPF (OSPFv2 or OSPFv3). Note: IPv6 state needs to be enabled to use OSPFv3.",
  {
    ospf_version: import_zod.z.string().trim().transform((val) => val.toLowerCase()).refine((val) => ["ospf2", "ospf3"].includes(val), {
      message: "OSPF version must be 'ospf2' or 'ospf3'"
    }),
    instance: import_zod.z.union([
      import_zod.z.literal("all"),
      import_zod.z.literal("default"),
      import_zod.z.number().int().min(1).max(65535)
    ]).optional().default("all"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        instance: args.instance || "all"
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      let apiEndpoint;
      switch (args.ospf_version) {
        case "ospf2":
          apiEndpoint = "show-inbound-route-filter-ospf2";
          break;
        case "ospf3":
          apiEndpoint = "show-inbound-route-filter-ospf3";
          break;
        default:
          throw new Error("Invalid ospf_version specified");
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", apiEndpoint, params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_ipv6",
  "Check IPv6 support in the machine's operating system. Returns IPv6 configuration status and reboot requirements.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-ipv6", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_router_id",
  "Show the configured router-id. Returns the current router ID configuration used by routing protocols like BGP and OSPF.",
  {
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-router-id", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_bootp_interfaces",
  "Show current state of all running bootp interfaces.20+.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-bootp-interfaces", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_routemaps",
  "Show the configuration of all configured Routemaps.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-routemaps", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_nat_pools",
  "Shows the configuration of all configured NAT Pools.",
  {
    limit: import_zod.z.number().int().min(1).max(200).optional().default(50),
    offset: import_zod.z.number().int().min(0).max(65535).optional().default(0),
    order: import_zod.z.enum(["ASC", "DESC"]).optional().default("ASC"),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {
        limit: args.limit,
        offset: args.offset,
        order: args.order
      };
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-nat-pools", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "show_interfaces_by_type",
  "Show network interfaces organized by their types. Returns comprehensive interface information categorized by interface types including: physical interfaces, loopback interfaces, bridge interfaces, bond interfaces, alias interfaces, VLAN interfaces, VXLAN interfaces, and GRE interfaces. Useful for network topology analysis and interface management.",
  {
    virtual_system_id: import_zod.z.number().int().optional(),
    member_id: import_zod.z.string().optional(),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      const params = {};
      if (typeof args.virtual_system_id === "number") {
        params["virtual-system-id"] = args.virtual_system_id;
      }
      if (typeof args.member_id === "string" && args.member_id.trim() !== "") {
        params["member-id"] = args.member_id.trim();
      }
      const apiManager = await getApiManagerWithDialog(args.gateway_ip, args.port, extra);
      const resp = await apiManager.callApi("POST", "show-interfaces-by-type", params);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);
server.tool(
  "manage_gaia_credentials",
  "Manage cached gateway credentials - clear specific gateway or default gateway cache",
  {
    action: import_zod.z.enum(["clear_gateway", "clear_default"]),
    gateway_ip: import_zod.z.string().optional(),
    port: import_zod.z.number().optional()
  },
  async (args, extra) => {
    try {
      console.error("Manage credentials called with args:", args);
      const action = args.action;
      if (!action) {
        throw new Error("Action is required. Must be one of: clear_gateway, clear_default");
      }
      if (action === "clear_gateway") {
        if (!args.gateway_ip) {
          throw new Error("Gateway IP is required for clear_gateway action");
        }
        const gatewayPort = args.port || 443;
        clearGaiaCredentials(args.gateway_ip, gatewayPort, extra);
        return {
          content: [{
            type: "text",
            text: `Cleared cached credentials for gateway: ${args.gateway_ip}:${gatewayPort}`
          }]
        };
      } else if (action === "clear_default") {
        clearDefaultGateway(extra);
        return {
          content: [{
            type: "text",
            text: "Cleared default gateway connection cache"
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `Invalid action: ${action}. Must be one of: clear_gateway, clear_default`
          }]
        };
      }
    } catch (error) {
      console.error("Manage credentials error:", error);
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }]
      };
    }
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
