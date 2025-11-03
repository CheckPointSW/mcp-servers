import { getHeaderValue } from "@chkp/mcp-utils";

export class Settings {
  constructor(
    public readonly defaultEncoding: string = "utf-8"
  ) {}

  validate(): boolean {
    return true;
  }

  static fromArgs(options: { encoding?: string } = {}): Settings {
    return new Settings(options.encoding || "utf-8");
  }

  static fromHeaders(headers: Record<string, string | string[]>): Settings {
    const encoding = getHeaderValue(headers, "CPINFO-ENCODING") || "utf-8";
    return new Settings(encoding);
  }
}
