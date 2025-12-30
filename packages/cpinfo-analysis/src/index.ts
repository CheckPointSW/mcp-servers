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
