#!/usr/bin/env node

import {
  launchMCPServer,
  createServerModule,
  createApiRunner,
  createMcpServer
} from "@chkp/mcp-utils";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CpInfoAPIManager } from "./api-manager.js";
import { Settings } from "./settings.js";
import { CpInfoService } from "./cpinfo-service.js";
import { registerCpinfoTools } from "./tool-handlers.js";
import { logger } from "./logger.js";
import { allowedRootsConfigured } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { server, pkg } = createMcpServer(import.meta.url, {
  description: "Semantic CPInfo analysis server"
});

// Log startup info
logger.info("CPInfo MCP Server starting up");
logger.info(`Version: ${pkg.version}`);
logger.info(`Log file: ${logger.getLogFilePath()}`);
logger.info(`Working directory: ${process.cwd()}`);

// Warm the allowed-roots cache now so a bad CPINFO_ALLOWED_ROOTS entry is
// reported at boot rather than on the first tool call.
const rootsConfigured = allowedRootsConfigured();

const isHttpTransport =
  (process.env.MCP_TRANSPORT_TYPE ?? "").toLowerCase() === "http" ||
  process.argv.some((a, i) => a.toLowerCase() === "--transport=http" ||
    (a === "--transport" && (process.argv[i + 1] ?? "").toLowerCase() === "http"));

if (isHttpTransport && !rootsConfigured) {
  logger.warning("================================================================");
  logger.warning("WARNING: starting in HTTP transport mode without CPINFO_ALLOWED_ROOTS set.");
  logger.warning("Any MCP client connected to this server can read any path this process");
  logger.warning("account can access on this host — there is no directory confinement.");
  logger.warning("Set CPINFO_ALLOWED_ROOTS to a comma-separated list of absolute directories");
  logger.warning("to restrict tool file access before exposing this server to multiple callers.");
  logger.warning("================================================================");
}

const serverModule = createServerModule(
  server,
  Settings,
  pkg,
  CpInfoAPIManager
);

const runApi = createApiRunner(serverModule);

const service = new CpInfoService();
const registeredTools = registerCpinfoTools(server, service);

logger.info(`Registering ${registeredTools} tools`);

const main = async () => {
  logger.info("Launching MCP server...");
  await launchMCPServer(
    join(__dirname, "server-config.json"),
    serverModule
  );
  logger.info("MCP server launched successfully");
};

main().catch((error) => {
  logger.error("Fatal error during startup", error);
  console.error("Fatal error:", error);
  process.exit(1);
});
