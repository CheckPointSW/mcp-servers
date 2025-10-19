#!/usr/bin/env node
const url = require("url");
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// packages/mcp-utils/dist/ui-dialog.js
var ui_dialog_exports = {};
__export(ui_dialog_exports, {
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
var import_http2, import_url, import_child_process, import_util, fs2, path, execAsync, UIDialog;
var init_ui_dialog = __esm({
  "packages/mcp-utils/dist/ui-dialog.js"() {
    "use strict";
    import_http2 = require("http");
    import_url = require("url");
    import_child_process = require("child_process");
    import_util = require("util");
    fs2 = __toESM(require("fs"), 1);
    path = __toESM(require("path"), 1);
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

// packages/documentation-tool/dist/index.js
var index_exports = {};
__export(index_exports, {
  server: () => server
});
module.exports = __toCommonJS(index_exports);
var import_zod = require("zod");
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");

// packages/mcp-utils/dist/launcher.js
var import_commander = require("commander");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_streamableHttp = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
var import_fs = __toESM(require("fs"), 1);
var import_http = __toESM(require("http"), 1);
var import_crypto = require("crypto");
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

// packages/mcp-utils/dist/settings-manager.js
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

// packages/mcp-utils/dist/api-manager-factory.js
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

// packages/mcp-utils/dist/session-context.js
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

// packages/mcp-utils/dist/session-manager.js
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

// packages/mcp-utils/dist/server-utils.js
function getHeaderValue(headers, key) {
  const value = headers[key] || headers[key.toUpperCase()] || headers[key.toLowerCase()];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
}
function createApiRunner(serverModule2) {
  return async (method, uri, data, extra, domain) => {
    const apiManager = SessionContext.getAPIManager(serverModule2, extra);
    return await apiManager.callApi(method, uri, data, domain);
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

// packages/mcp-utils/dist/index.js
init_ui_dialog();

// packages/documentation-tool/dist/index.js
var import_fs2 = require("fs");
var import_path = require("path");
var import_url2 = require("url");

// packages/documentation-tool/dist/documentation-api-manager.js
var import_axios3 = __toESM(require("axios"), 1);

// packages/infra/dist/api-client.js
var import_axios = __toESM(require("axios"), 1);
var TokenType;
(function(TokenType2) {
  TokenType2["API_KEY"] = "API_KEY";
  TokenType2["CI_TOKEN"] = "CI_TOKEN";
})(TokenType || (TokenType = {}));

// packages/infra/dist/string-utils.js
function nullOrEmpty(val) {
  return val === void 0 || val === null || typeof val === "string" && (val.trim() === "" || val === "undefined" || val === "null");
}

// packages/infra/dist/settings.js
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

// packages/infra/dist/external-user-token-manager.js
var import_axios2 = __toESM(require("axios"), 1);
var ExternalTokenManager = class _ExternalTokenManager {
  /**
   * Create a new ExternalTokenManager
   *
   * @param settings Settings containing clientId and secretKey
   */
  constructor(settings) {
    this.settings = settings;
    this.tokenCache = /* @__PURE__ */ new Map();
  }
  authUrl() {
    const gatewayUrl = this.settings.getCloudInfraGateway();
    return `${gatewayUrl}/auth/external`;
  }
  /**
   * Get a valid auth token, fetching a new one if necessary
   * @returns Promise resolving to a valid token
   */
  async getToken() {
    if (!this.settings.clientId || !this.settings.secretKey) {
      throw new Error("Client ID and Secret Key are required for external user authentication");
    }
    const cacheKey = `${this.settings.clientId}:${this.settings.region || "EU"}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    const response = await import_axios2.default.post(this.authUrl(), {
      clientId: this.settings.clientId,
      accessKey: this.settings.secretKey
    }, {
      timeout: 3e4,
      validateStatus: () => true
    });
    if (response.status !== 200) {
      const errorData = response.data ? JSON.stringify(response.data) : "No response data";
      throw new Error(`Failed to get auth token: ${response.statusText} (${response.status}). Response data: ${errorData}`);
    }
    const responseData = response.data;
    const token = responseData.data.token;
    const expiresIn = responseData.data.expiresIn;
    if (!token || !expiresIn) {
      throw new Error("Invalid token response from auth server");
    }
    const tokenInfo = {
      token,
      expiresAt: Date.now() + expiresIn * 1e3 - 5e3
    };
    this.tokenCache.set(cacheKey, tokenInfo);
    return token;
  }
  /**
   * Create a token service instance
   * @param settings Settings containing clientId and secretKey
   * @returns A new ExternalUserTokenManager
   * instance
   */
  static create(settings) {
    return new _ExternalTokenManager(settings);
  }
};
var ExternalUserTokenManager = class _ExternalUserTokenManager extends ExternalTokenManager {
  static create(settings) {
    return new _ExternalUserTokenManager(settings);
  }
  authUrl() {
    const gatewayUrl = this.settings.getCloudInfraGateway();
    return `${gatewayUrl}/auth/external/user`;
  }
};

// packages/documentation-tool/dist/documentation-api-manager.js
var DocumentationToolAPIManager = class _DocumentationToolAPIManager {
  constructor(settings) {
    this.settings = settings;
    this.tokenService = new ExternalUserTokenManager(settings);
    this.axios = import_axios3.default.create({
      timeout: 3e4,
      validateStatus: () => true
    });
  }
  /**
   * Create a new DocumentationToolAPIManager instance from settings for Documentation Tool
   * @param settings The complete settings object for this session
   * @returns A new DocumentationToolAPIManager instance
   */
  static create(settings) {
    return new _DocumentationToolAPIManager(settings);
  }
  /**
   * Get a valid auth token using the shared token service
   */
  async getToken() {
    return await this.tokenService.getToken();
  }
  /**
   * Get the base URL for API calls, handling local development if needed
   */
  getBaseUrl() {
    if (this.settings.region === "LOCAL") {
      return `http://localhost:${this.settings.devPort || "8006"}`;
    }
    return `${this.settings.getCloudInfraGateway()}/app/console-one`;
  }
  async callApi(method, uri, data) {
    const token = await this.getToken();
    const chatUrl = `${this.getBaseUrl()}/${uri}`;
    const question = data.question;
    const product = data.product;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    const params = {
      question,
      product,
      skip_llm: true
    };
    try {
      const response = await this.axios.post(chatUrl, params, {
        headers
      });
      if (response.status !== 200) {
        console.error("Error response body:", JSON.stringify(response.data, null, 2));
        throw new Error(`Chat request failed: ${response.statusText} (${response.status})`);
      }
      return {
        response: response.data.response
      };
    } catch (error) {
      const axiosError = error;
      console.error("Axios error:", axiosError.message);
      if (axiosError.response) {
        console.error("Error status:", axiosError.response.status);
        console.error("Error headers:", JSON.stringify(axiosError.response.headers, null, 2));
        console.error("Error data:", JSON.stringify(axiosError.response.data, null, 2));
      }
      throw error;
    }
  }
};

// packages/documentation-tool/dist/settings.js
var DocumentationToolSettings = class _DocumentationToolSettings extends Settings {
  constructor(args = {}) {
    super(args);
  }
  /**
   * Create DocumentationToolSettings from command-line arguments for Documentation Tool
   */
  static fromArgs(args) {
    return new _DocumentationToolSettings({
      ...args
    });
  }
};

// packages/documentation-tool/dist/index.js
var import_meta = {};
var pkg = JSON.parse((0, import_fs2.readFileSync)((0, import_path.join)((0, import_path.dirname)((0, import_url2.fileURLToPath)(url.pathToFileURL(__filename).toString())), "../package.json"), "utf-8"));
process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;
var server = new import_mcp.McpServer({
  name: "checkpoint-documentation",
  description: "Comprehensive Check Point documentation assistant providing instant access to product information, technical specifications, configuration guidance, and feature documentation across the entire Check Point security portfolio.",
  version: "1.0.0"
});
var serverModule = createServerModule(server, DocumentationToolSettings, pkg, DocumentationToolAPIManager);
var runApi = createApiRunner(serverModule);
server.tool("ask-checkpoint-docs", "Ask Check Point documentation. Use this to get information about Check Point products and features.", {
  text: import_zod.z.string().describe(`The question to ask Check Point, in clear text with clear concise context and instructions.
            The question should be about one of the Check Point products (e.g., Smart-1 Cloud, Harmony SASE, CloudGuard, Harmony Endpoint, etc.).
            Include relevant technical details, product names, feature names, and specific use cases for the most accurate and helpful response.`),
  product: import_zod.z.enum([
    "s1c",
    "maas",
    "mobile",
    "endpoint",
    "edr",
    "xdr",
    "playblocks",
    "infinity-events",
    "cloudguard",
    "cloudguardnetwork",
    "cloudnetworksecurity",
    "rfp-copilot",
    "harmony-sase",
    "customer-support",
    "smp",
    "appsec",
    "sd-wan",
    "horizonmonitoring",
    "ndr"
  ]).optional().describe(`Select the specific Check Point product to target for focused documentation queries. This parameter helps narrow down search results to the most relevant product-specific information. Defaults to 's1c' (Smart-1 Cloud) if not specified. Choose from:

                Cloud Management & Security:
                - s1c: Smart-1 Cloud - Cloud-based security management platform for centralized policy management (DEFAULT)
                - maas: Management as a Service - Cloud management platform for distributed deployments
                - cloudguard: CloudGuard - Comprehensive cloud security and compliance platform
                - cloudguardnetwork: CloudGuard Network - Cloud network security solutions
                - cloudnetworksecurity: CloudGuard Network Security - Advanced cloud network protection
                - appsec: CloudGuard WAF - Web Application Firewall and application security

                Endpoint & Device Security:
                - mobile: Harmony Mobile - Mobile device security and threat protection
                - endpoint: Harmony Endpoint - Endpoint protection and threat prevention
                - edr: Endpoint Detection and Response - Advanced endpoint threat detection and response
                - xdr: Extended Detection and Response - Cross-platform threat detection and response

                Network & Infrastructure:
                - harmony-sase: Harmony SASE - Secure Access Service Edge platform
                - sd-wan: Quantum SD-WAN - Software-defined wide area networking solutions
                - horizonmonitoring: Horizon Monitoring - AI-powered network operations and monitoring
                - ndr: Network Detection and Response - Advanced network threat detection

                Automation & Intelligence:
                - playblocks: Infinity Playblocks - Security automation and orchestration platform
                - infinity-events: Infinity Events - Centralized security event management platform
                - rfp-copilot: RFP Copilot - AI-powered request for proposal assistance

                Support & Management:
                - customer-support: Customer Support - Technical support and assistance services
                - smp: Security Management Platform - Unified security management

                Usage Guidelines:
                - Defaults to s1c (Smart-1 Cloud) for general management and security questions
                - Specify a different product when the user's question is clearly about that specific product
                - For troubleshooting or configuration questions, specify the exact product involved.`)
}, async ({ text, product }, extra) => {
  try {
    const result = await runApi("post", "api/v1/doc/ask_docs", { question: text, product }, extra);
    return {
      content: [
        {
          type: "text",
          text: result.response
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `API Error: ${error.message}`
        }
      ]
    };
  }
});
var main = async () => {
  await launchMCPServer((0, import_path.join)((0, import_path.dirname)((0, import_url2.fileURLToPath)(url.pathToFileURL(__filename).toString())), "server-config.json"), serverModule);
};
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  server
});
