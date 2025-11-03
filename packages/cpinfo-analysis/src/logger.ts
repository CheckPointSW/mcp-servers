import { writeFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3
}

class Logger {
  private logFilePath?: string;
  private logLevel: LogLevel = LogLevel.INFO;
  private name: string;

  constructor(name: string) {
    this.name = name;
    this.initializeLogFile();
  }

  private initializeLogFile(): void {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = join(__dirname, "../logs");
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
      this.logFilePath = join(logsDir, `cpinfo_server_${timestamp}.log`);

      // Write initial header
      const header = `=== CPInfo Server Log Started at ${new Date().toISOString()} ===\n`;
      writeFileSync(this.logFilePath, header, "utf-8");
    } catch (error) {
      console.error("Failed to initialize log file:", error);
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} - ${this.name} - ${level} - ${message}`;
  }

  private writeLog(level: string, message: string): void {
    const formatted = this.formatMessage(level, message);

    // Always write to stderr (like Python's StreamHandler)
    console.error(formatted);

    // Also write to file if available
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, formatted + "\n", "utf-8");
      } catch (error) {
        console.error("Failed to write to log file:", error);
      }
    }
  }

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  debug(message: string): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.writeLog("DEBUG", message);
    }
  }

  info(message: string): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.writeLog("INFO", message);
    }
  }

  warning(message: string): void {
    if (this.logLevel <= LogLevel.WARNING) {
      this.writeLog("WARNING", message);
    }
  }

  error(message: string, error?: Error): void {
    if (this.logLevel <= LogLevel.ERROR) {
      const errorDetails = error ? `\n${error.stack || error.message}` : "";
      this.writeLog("ERROR", message + errorDetails);
    }
  }

  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }
}

// Create default logger instances for each module
export function createLogger(name: string): Logger {
  return new Logger(name);
}

// Default logger for the package
export const logger = createLogger("cpinfo-analysis");
