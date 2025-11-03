import { basename } from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CpInfoService } from "./cpinfo-service.js";
import { CpInfoAdvancedIndex } from "./cpinfo-index.js";
import { CpInfoReader } from "./cpinfo-reader.js";
import {
  BasicCache,
  CoreDumpCache,
  FileProcessingCache,
  InitializationStatus,
  LicensingCache,
  NetworkCache,
  PerformanceCache,
  ProcessingStatus,
  SectionCacheEntry,
  SectionInfo,
  SectionType,
  SecurityCache
} from "./types.js";

interface McpContent {
  type: "text";
  text: string;
}

interface ToolResult {
  content: McpContent[];
}

const SECTION_TYPE_OPTIONS = [
  "system_info",
  "performance",
  "diagnostics",
  "security",
  "licensing",
  "network",
  "log_files",
  "command_output",
  "core_dumps",
  "configuration",
  "vpn",
  "firewall",
  "monitoring",
  "database",
  "processes",
  "unknown"
] as const;

type SectionTypeString = (typeof SECTION_TYPE_OPTIONS)[number];

type CachedSearchResult = {
  lines: string[];
  scanned: number;
};

interface ContentMatch {
  text: string;
  lineNumber: number;
}

const DEFAULT_SECTION_PAGE_SIZE = 30;
const SECTION_SEARCH_CHUNK_BYTES = 64 * 1024; // 64KB chunks keep memory bounded during scans
const SECTION_SEARCH_MAX_BYTES = 50 * 1024 * 1024; // Guardrail for extremely large sections (50MB)
const SECTION_MATCH_LINES_LIMIT = 5;

function textResult(lines: string[]): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: lines.join("\n")
      }
    ]
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatBytes(value: number): string {
  if (value === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return unitIndex === 0 ? `${Math.round(size)} ${units[unitIndex]}` : `${size.toFixed(2)} ${units[unitIndex]}`;
}

function paginate<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { pageItems, totalPages };
}

function sectionTypeFromString(value: SectionTypeString): SectionType {
  return SectionType[value.toUpperCase() as keyof typeof SectionType];
}

function debugToolsEnabled(): boolean {
  const flag = process.env.CPINFO_ENABLE_DEBUG_TOOLS ?? process.env.CPINFO_DEBUG_TOOLS;
  if (!flag) {
    return false;
  }
  return flag.trim().toLowerCase() === "true";
}

function describeCache(cache: BasicCache | null, title: string): string[] {
  if (!cache) {
    return [`${title}: not cached`];
  }
  const lines = [`${title}: ${formatNumber(cache.sections_count)} sections (${formatNumber(cache.sections.length)} cached)`];
  if (cache.summary && Object.keys(cache.summary).length > 0) {
    lines.push(`Summary: ${JSON.stringify(cache.summary)}`);
  }
  return lines;
}

function buildOverview(cache: FileProcessingCache, fileName: string, showStats: boolean): string[] {
  const lines: string[] = [];
  const summary = cache.semantic_analysis;
  lines.push(`# CPInfo Analysis - ${fileName}`);

  if (!summary) {
    lines.push("File not initialized. Run analysis first.");
    return lines;
  }

  lines.push("## File Overview");
  lines.push(`Total sections: ${formatNumber(summary.total_sections)}`);
  lines.push(`File size: ${formatBytes(summary.file_size)}`);
  lines.push("");

  lines.push("## Section Categories");
  Object.entries(summary.categories).forEach(([category, count]) => {
    lines.push(`- ${category.replace(/_/g, " ")}: ${formatNumber(count)}`);
  });
  lines.push("");

  lines.push("## Recommended Next Steps");
  if (summary.categories.system_info) {
    lines.push("- Use extract_system_details for OS and platform information.");
  }
  if (summary.categories.performance) {
    lines.push("- Use analyze_performance_metrics for CPU and memory stats.");
  }
  if (summary.categories.security) {
    lines.push("- Use audit_security_settings for user and permissions review.");
  }
  if (summary.categories.licensing) {
    lines.push("- Use extract_license_information to inspect blade entitlements.");
  }
  lines.push("- Use smart_content_search for keyword-based queries.");
  lines.push("- Use read_section_content for detailed section review.");
  lines.push("");

  if (showStats) {
    lines.push("## Cache Statistics");
    lines.push(...describeCache(cache.system_info_cache, "System info"));
    lines.push(...describeCache(cache.performance_cache, "Performance"));
    lines.push(...describeCache(cache.security_cache, "Security"));
    lines.push(...describeCache(cache.licensing_cache, "Licensing"));
    if (cache.core_dumps_cache) {
      lines.push(`Core dumps cached: ${formatNumber(cache.core_dumps_cache.sections.length)}`);
    }
  }

  return lines;
}

function summarizeSection(section: SectionInfo, index: number): string[] {
  const lines = [`${index}. ${section.name}`];
  lines.push(`   Offset: ${formatNumber(section.startOffset)}`);
  if (section.endOffset) {
    lines.push(`   Size: ${formatNumber(section.endOffset - section.startOffset)} bytes`);
  }
  if (section.metadata?.pattern_type) {
    lines.push(`   Pattern: ${section.metadata.pattern_type}`);
  }
  return lines;
}

async function buildSectionContent(
  service: CpInfoService,
  filePath: string,
  sectionName: string,
  page: number,
  pageSize: number
): Promise<string[]> {
  const { reader, cache } = await service.ensureFileInitialized(filePath);
  const normalized = sectionName.toLowerCase();

  const index = reader.getIndex();
  const allSections = index.getAllSections();

  const locateSection = (): SectionInfo | undefined => {
    const byExact = allSections.find((section) => section.name.toLowerCase() === normalized);
    if (byExact) {
      return byExact;
    }
    const cachedEntry = cache.section_content_cache.get(normalized);
    if (cachedEntry) {
      const byOffset = allSections.find((section) => section.startOffset === cachedEntry.offset);
      if (byOffset) {
        return byOffset;
      }
    }
    return allSections.find((section) => section.name.toLowerCase().includes(normalized));
  };

  const section = locateSection();

  if (!section) {
    return [`Section '${sectionName}' not found.`];
  }

  const sectionSize = Math.max(
    0,
    (section.endOffset ?? reader.fileSizeBytes) - section.startOffset
  );

  let target = cache.section_content_cache.get(normalized);

  const targetBytes = target ? Buffer.byteLength(target.content, reader.encoding) : 0;
  const isComplete = Boolean(target?.metadata?.fullContent);
  const needsRefresh = !target || target.offset !== section.startOffset || (!isComplete && sectionSize > targetBytes);

  if (needsRefresh) {
    const bytesToRead = sectionSize > 0 ? sectionSize : reader.fileSizeBytes - section.startOffset;
    const safeBytes = bytesToRead > 0 ? bytesToRead : 5 * 1024 * 1024;
    const content = await reader.readSectionByOffset(section.startOffset, safeBytes);
    target = {
      name: section.name,
      content,
      offset: section.startOffset,
      size: sectionSize || undefined,
      metadata: { ...(target?.metadata ?? {}), fullContent: true }
    };
    cache.section_content_cache.set(normalized, target);
  } else if (target && section.name !== target.name) {
    target = {
      ...target,
      name: section.name
    };
    cache.section_content_cache.set(normalized, target);
  }

  if (!target) {
    return [`Section '${sectionName}' not found.`];
  }

  const contentLines = target.content.split(/\r?\n/);
  const totalLineCount = contentLines.length;
  const totalPages = Math.max(1, Math.ceil(totalLineCount / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const lineStart = totalLineCount > 0 ? (currentPage - 1) * pageSize : 0;
  const lineEnd = totalLineCount > 0 ? Math.min(lineStart + pageSize, totalLineCount) : 0;
  const pageLines = contentLines.slice(lineStart, lineEnd);
  const pageContent = pageLines.join("\n");

  const lines: string[] = [];
  lines.push(`# Section Content: ${target.name}`);
  lines.push(`Offset: ${formatNumber(target.offset)}`);
  lines.push(`Page ${currentPage}/${totalPages}`);
  lines.push("");
  const nextPageNumber = currentPage < totalPages ? currentPage + 1 : null;
  lines.push("READING PROTOCOL");
  lines.push("- If your task requires full coverage of this section, you MUST read every page sequentially.");
  lines.push(
    "- To fetch the next portion, call read_section_content again with page=" +
      (nextPageNumber ?? currentPage) +
      "."
  );
  lines.push(
    "- Stop calling the tool once you have the information you need" +
      (totalPages > 1 ? " or after page " + totalPages : "") +
      "."
  );
  lines.push("");
  lines.push(
    `[PAGING] current=${currentPage}; total=${totalPages}; next=${nextPageNumber ?? "n/a"}; has_more=${nextPageNumber !== null}`
  );
  lines.push("");
  const displayStartLine = totalLineCount > 0 ? lineStart + 1 : 0;
  const displayEndLine = totalLineCount > 0 ? lineEnd : 0;
  lines.push(`Lines ${formatNumber(displayStartLine)}-${formatNumber(displayEndLine)} of ${formatNumber(totalLineCount)}`);
  lines.push("```");
  lines.push(pageContent);
  lines.push("```");

  return lines;
}

async function scanSectionForTerm(
  reader: CpInfoReader,
  section: SectionInfo,
  term: string,
  caseSensitive: boolean
): Promise<ContentMatch[]> {
  const matches: ContentMatch[] = [];
  const sectionEnd = section.endOffset ?? reader.fileSizeBytes;
  const rawSize = Math.max(0, sectionEnd - section.startOffset);
  if (rawSize === 0) {
    return matches;
  }

  const limit = Math.min(rawSize, SECTION_SEARCH_MAX_BYTES);
  const chunkSize = Math.min(SECTION_SEARCH_CHUNK_BYTES, limit);
  const encoding = reader.encoding ?? "utf-8";

  let processed = 0;
  let remainder = "";
  let lineNumber = 0;

  while (processed < limit && matches.length < SECTION_MATCH_LINES_LIMIT) {
    const targetBytes = Math.min(chunkSize, limit - processed);
    const chunk = await reader.readSectionByOffset(section.startOffset + processed, targetBytes);
    if (!chunk) {
      break;
    }

    const bytesRead = Buffer.byteLength(chunk, encoding);
    if (bytesRead === 0) {
      break;
    }
    processed += bytesRead;

    const combined = remainder + chunk;
    const lines = combined.split(/\r?\n/);
    const lastLineComplete = combined.endsWith("\n") || combined.endsWith("\r");

    remainder = "";
    if (!lastLineComplete) {
      remainder = lines.pop() ?? "";
    }

    for (const line of lines) {
      lineNumber += 1;
      const comparison = caseSensitive ? line : line.toLowerCase();
      if (comparison.includes(term)) {
        matches.push({ text: line.trim(), lineNumber });
        if (matches.length >= SECTION_MATCH_LINES_LIMIT) {
          break;
        }
      }
    }
  }

  if (matches.length < SECTION_MATCH_LINES_LIMIT && remainder) {
    lineNumber += 1;
    const comparison = caseSensitive ? remainder : remainder.toLowerCase();
    if (comparison.includes(term)) {
      matches.push({ text: remainder.trim(), lineNumber });
    }
  }

  return matches;
}

function buildPerformanceSummary(cache: PerformanceCache | null): string[] {
  if (!cache) {
    return ["No performance cache available."];
  }
  const lines: string[] = [];
  lines.push(`# Performance Analysis`);
  lines.push(`Sections cached: ${formatNumber(cache.sections.length)} / ${formatNumber(cache.sections_count)}`);
  lines.push(`CPU spikes detected: ${cache.has_cpu_spikes ? "Yes" : "No"}`);
  lines.push(`Memory issues detected: ${cache.has_memory_issues ? "Yes" : "No"}`);
  lines.push("");

  cache.sections.slice(0, 5).forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.name}`);
    lines.push("---");
    lines.push(entry.content.split("\n").slice(0, 12).join("\n"));
    lines.push("");
  });

  return lines;
}

function buildLicensingSummary(cache: LicensingCache | null): string[] {
  if (!cache) {
    return ["No licensing sections found."];
  }
  const lines: string[] = [];
  lines.push(`# Licensing Information`);
  lines.push(`Sections cached: ${formatNumber(cache.sections.length)} / ${formatNumber(cache.sections_count)}`);
  lines.push(`License tables detected: ${cache.license_tables.join(", ") || "none"}`);
  lines.push(`Expired licenses detected: ${cache.has_expired_licenses ? "Yes" : "No"}`);
  lines.push("");

  cache.sections.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.name}`);
    lines.push("---");
    lines.push(entry.content.split("\n").slice(0, 15).join("\n"));
    lines.push("");
  });

  return lines;
}

function buildSecuritySummary(cache: SecurityCache | null): string[] {
  if (!cache) {
    return ["No security sections found."];
  }
  const lines: string[] = [];
  lines.push(`# Security Settings`);
  lines.push(`Sections cached: ${formatNumber(cache.sections.length)} / ${formatNumber(cache.sections_count)}`);
  lines.push(`User information present: ${cache.has_user_info ? "Yes" : "No"}`);
  lines.push(`Permission information present: ${cache.has_permission_info ? "Yes" : "No"}`);
  lines.push("");

  cache.sections.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.name}`);
    lines.push("---");
    lines.push(entry.content.split("\n").slice(0, 12).join("\n"));
    lines.push("");
  });

  return lines;
}

function buildCoreDumpSummary(cache: CoreDumpCache | null): string[] {
  if (!cache) {
    return ["No core dump information available."];
  }
  const lines: string[] = [];
  lines.push(`# Core Dump Analysis`);
  lines.push(`Core dumps found: ${formatNumber(cache.sections_count)}`);
  if (!cache.sections.length) {
    lines.push("No core dump sections cached.");
    return lines;
  }
  cache.sections.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.name}`);
    lines.push("---");
    lines.push(entry.content.split("\n").slice(0, 12).join("\n"));
    lines.push("");
  });
  if (cache.crash_summary.length) {
    lines.push("Common crash indicators:");
    cache.crash_summary.slice(0, 5).forEach((line) => lines.push(`- ${line}`));
  }
  return lines;
}

function buildNetworkSummary(cache: NetworkCache | null, page: number, sectionsPerPage: number, includeInterfaces: boolean): string[] {
  if (!cache) {
    return ["No network configuration sections found."];
  }
  const lines: string[] = [];
  lines.push(`# Network Configuration`);
  lines.push(`Network sections: ${formatNumber(cache.sections_count)}`);
  lines.push(`Interfaces detected: ${formatNumber(cache.interfaces.length)}`);
  lines.push(`Configuration issues: ${formatNumber(cache.config_issues.length)}`);
  lines.push("");

  if (cache.config_issues.length) {
    lines.push("Top configuration issues:");
    cache.config_issues.slice(0, 5).forEach((issue) => lines.push(`- ${issue}`));
    lines.push("");
  }

  if (includeInterfaces && cache.interfaces.length) {
    lines.push("Interfaces summary:");
    cache.interfaces.slice(0, 10).forEach((iface) => {
      lines.push(`- ${iface.name}`);
    });
    lines.push("");
  }

  const { pageItems, totalPages } = paginate(cache.sections, page, sectionsPerPage);
  lines.push(`Page ${page}/${totalPages}`);
  pageItems.forEach((entry, index) => {
    lines.push(`${index + 1 + (page - 1) * sectionsPerPage}. ${entry.name}`);
    lines.push("---");
    lines.push(entry.content.split("\n").slice(0, 12).join("\n"));
    lines.push("");
  });

  if (page < totalPages) {
    lines.push(`Use page=${page + 1} for the next page.`);
  }

  return lines;
}

export function registerCpinfoTools(server: McpServer, service: CpInfoService): number {
  const debugToolsActive = debugToolsEnabled();
  let registeredTools = 0;

  server.tool(
    "check_initialization_status",
    "Check or ensure a cpinfo file is initialized and get detailed status. Use initialize=true to trigger initialization if not already done, or initialize=false to just check current status without processing.",
    {
      file_path: z.string().describe("Path to cpinfo file"),
      initialize: z.boolean().optional().describe("If true, ensures file is initialized (default: true). If false, only checks current status without triggering initialization.")
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const shouldInitialize = args.initialize !== false; // Default to true
      
      let cache;
      if (shouldInitialize) {
        const result = await service.ensureFileInitialized(filePath);
        cache = result.cache;
      } else {
        cache = service.getProcessingSnapshot(filePath);
      }
      
      const status = service.getInitializationStatus(filePath);
      const ready = cache.initialized && status.status === ProcessingStatus.COMPLETE;
      const lines = formatInitializationStatus(status, ready);
      
      if (ready && cache.semantic_analysis) {
        const summary = cache.semantic_analysis;
        lines.push("");
        lines.push("## Summary");
        lines.push(`Total sections: ${formatNumber(summary.total_sections)}`);
        lines.push(`File size: ${formatBytes(summary.file_size)}`);
        lines.push("Categories:");
        Object.entries(summary.categories).forEach(([category, count]) => {
          lines.push(`- ${category}: ${formatNumber(count)}`);
        });
      }
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "analyze_cpinfo_overview",
    "Run comprehensive analysis with semantic categorization.",
    {
      file_path: z.string().describe("Path to cpinfo file"),
      show_stats: z.boolean().describe("Include cache statistics").optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const showStats = args.show_stats as boolean | undefined;
      const { cache } = await service.ensureFileInitialized(filePath);
      const lines = buildOverview(cache, basename(filePath), showStats !== false);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "browse_sections_by_category",
    "List sections by semantic category.",
    {
      file_path: z.string().describe("Path to cpinfo file"),
      section_type: z.enum(SECTION_TYPE_OPTIONS).describe("Category to browse"),
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const sectionType = args.section_type as SectionTypeString;
      const page = (args.page as number | undefined) ?? 1;
      const pageSize = (args.page_size as number | undefined) ?? 10;
      const { reader } = await service.ensureFileInitialized(filePath);
      const sections = await reader.getSectionsByType(sectionTypeFromString(sectionType));
      const { pageItems, totalPages } = paginate(sections, page, pageSize);
      const lines: string[] = [];
      lines.push(`# Sections: ${sectionType}`);
      lines.push(`Page ${page}/${totalPages}`);
      pageItems.forEach((section, index) => {
        lines.push(...summarizeSection(section, index + 1 + (page - 1) * pageSize));
      });
      if (page < totalPages) {
        lines.push(`Use page=${page + 1} for the next page.`);
      }
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "extract_system_details",
    "Extract key system information sections.",
    {
      file_path: z.string(),
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const page = (args.page as number | undefined) ?? 1;
      const pageSize = (args.page_size as number | undefined) ?? 5;
      const { cache } = await service.ensureFileInitialized(filePath);
      const systemCache = cache.system_info_cache;
      if (!systemCache) {
        return textResult(["No system information sections cached."]);
      }
      const { pageItems, totalPages } = paginate(systemCache.sections, page, pageSize);
      const lines: string[] = [];
      lines.push(`# System Information`);
      lines.push(`Sections cached: ${formatNumber(systemCache.sections.length)} / ${formatNumber(systemCache.sections_count)}`);
      lines.push(`Page ${page}/${totalPages}`);
      pageItems.forEach((entry, index) => {
        lines.push(`${index + 1 + (page - 1) * pageSize}. ${entry.name}`);
        lines.push("---");
        lines.push(entry.content.split("\n").slice(0, 12).join("\n"));
        lines.push("");
      });
      if (page < totalPages) {
        lines.push(`Use page=${page + 1} for more.`);
      }
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "analyze_performance_metrics",
    "Summarize performance related sections.",
    {
      file_path: z.string()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const { cache } = await service.ensureFileInitialized(filePath);
      const lines = buildPerformanceSummary(cache.performance_cache);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "extract_license_information",
    "Summarize licensing information.",
    {
      file_path: z.string()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const { cache } = await service.ensureFileInitialized(filePath);
      const lines = buildLicensingSummary(cache.licensing_cache);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "audit_security_settings",
    "Summarize security configuration and users.",
    {
      file_path: z.string()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const { cache } = await service.ensureFileInitialized(filePath);
      const lines = buildSecuritySummary(cache.security_cache);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "detect_system_crashes",
    "Review core dump information for crashes.",
    {
      file_path: z.string()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const { cache } = await service.ensureFileInitialized(filePath);
      const lines = buildCoreDumpSummary(cache.core_dumps_cache);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "extract_network_config",
    "Inspect network configuration sections.",
    {
      file_path: z.string(),
      include_interfaces: z.boolean().optional(),
      page: z.number().int().positive().optional(),
      sections_per_page: z.number().int().positive().optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const includeInterfaces = (args.include_interfaces as boolean | undefined) ?? true;
      const page = (args.page as number | undefined) ?? 1;
      const sectionsPerPage = (args.sections_per_page as number | undefined) ?? 5;
      const { cache } = await service.ensureFileInitialized(filePath);
      const lines = buildNetworkSummary(cache.network_cache, page, sectionsPerPage, includeInterfaces);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "read_section_content",
    "Read raw section content with pagination.",
    {
      file_path: z.string(),
      section_name: z.string(),
      page: z.number().int().positive().optional(),
      page_size: z
        .number()
        .int()
        .positive()
        .describe("Lines per page (default 30)")
        .optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const sectionName = args.section_name as string;
      const page = (args.page as number | undefined) ?? 1;
      const pageSize = (args.page_size as number | undefined) ?? 30;
      const lines = await buildSectionContent(service, filePath, sectionName, page, pageSize);
      return textResult(lines);
    }
  );
  registeredTools += 1;

  server.tool(
    "smart_content_search",
    "Search sections by keyword with optional filtering.",
    {
      file_path: z.string(),
      keyword: z.string(),
      section_types: z.array(z.enum(SECTION_TYPE_OPTIONS)).optional(),
      case_sensitive: z.boolean().optional(),
      search_content: z.boolean().optional(),
      max_results: z.number().int().positive().optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const keyword = args.keyword as string;
      const sectionTypes = (args.section_types as SectionTypeString[] | undefined) ?? [];
      const caseSensitive = (args.case_sensitive as boolean | undefined) ?? false;
      const searchContent = (args.search_content as boolean | undefined) ?? true;
      const maxResults = (args.max_results as number | undefined) ?? 50;
      const { reader, cache } = await service.ensureFileInitialized(filePath);
      const cacheKey = JSON.stringify({ keyword, sectionTypes, caseSensitive, searchContent, maxResults });
      const cached = cache.search_cache.get(cacheKey) as CachedSearchResult | undefined;
      if (cached) {
        return textResult(cached.lines);
      }
      const searchTerm = caseSensitive ? keyword : keyword.toLowerCase();
      const sectionsToSearch: SectionInfo[] = [];

      if (sectionTypes.length) {
        for (const type of sectionTypes) {
          const mapped = sectionTypeFromString(type);
          const sections = await reader.getSectionsByType(mapped);
          sectionsToSearch.push(...sections);
        }
      } else {
        for (const type of Object.values(SectionType)) {
          const sections = await reader.getSectionsByType(type as SectionType);
          sectionsToSearch.push(...sections);
        }
      }

      const matches: { section: SectionInfo; hits: ContentMatch[] }[] = [];
      let scanned = 0;

      for (const section of sectionsToSearch) {
        if (matches.length >= maxResults) {
          break;
        }
        scanned += 1;
        const name = caseSensitive ? section.name : section.name.toLowerCase();
        const nameMatch = name.includes(searchTerm);
        let contentMatches: ContentMatch[] = [];

        if (searchContent) {
          contentMatches = await scanSectionForTerm(reader, section, searchTerm, caseSensitive);
        }

        if (nameMatch || contentMatches.length > 0) {
          matches.push({ section, hits: contentMatches });
        }
      }

      const lines: string[] = [];
      lines.push(`# Search Results for '${keyword}'`);
      lines.push(`Sections scanned: ${formatNumber(scanned)}`);
      lines.push(`Matches found: ${formatNumber(matches.length)}`);
      if (matches.length >= maxResults) {
        lines.push(`Results truncated at ${maxResults}. Refine your query for more specific matches.`);
      }
      lines.push("");

      matches.forEach(({ section, hits }, index) => {
        lines.push(`${index + 1}. ${section.name}`);
        lines.push(`   Type: ${section.sectionType}`);
        lines.push(`   Offset: ${formatNumber(section.startOffset)}`);
        if (hits.length) {
          lines.push("   Matching lines:");
          hits.forEach(({ text, lineNumber }) => {
            // Note: Page numbers removed due to inconsistency with user-specified page_size
            // Use line numbers to navigate. To calculate page: Math.floor((line-1)/page_size)+1
            lines.push(`   - [line ${lineNumber}] ${text}`);
          });
        }
        lines.push("");
      });

      cache.search_cache.set(cacheKey, { lines, scanned });

      return textResult(lines);
    }
  );
  registeredTools += 1;

  if (debugToolsActive) {
    server.tool(
      "manage_unknown_sections",
      "Manage sections that could not be automatically categorized.",
      {
        file_path: z.string().describe("Path to cpinfo file"),
        action: z.enum(["list", "suggest", "reclassify", "bulk_reclassify"]).describe("Action to perform"),
        section_name: z.string().optional().describe("Section name for suggest or reclassify"),
        new_category: z.string().optional().describe("New category for reclassify"),
        pattern_mappings: z
          .record(z.string())
          .optional()
          .describe("Pattern to category mappings for bulk reclassify"),
        page: z.number().int().positive().optional(),
        page_size: z.number().int().positive().optional()
      },
      async (args: Record<string, unknown>): Promise<any> => {
        const filePath = args.file_path as string;
        const action = args.action as "list" | "suggest" | "reclassify" | "bulk_reclassify";
        const sectionName = args.section_name as string | undefined;
        const newCategory = args.new_category as string | undefined;
        const patternMappings = args.pattern_mappings as Record<string, string> | undefined;
        const page = (args.page as number | undefined) ?? 1;
        const pageSize = (args.page_size as number | undefined) ?? 20;
        return handleManageUnknownSections(service, filePath, {
          action,
          sectionName,
          newCategory,
          patternMappings,
          page,
          pageSize
        });
      }
    );
    registeredTools += 1;
  }

  server.tool(
    "comprehensive_health_analysis",
    "Correlate multiple caches for health insights.",
    {
      file_path: z.string(),
      analysis_type: z.enum(["system", "performance", "licensing", "security"]).describe("Analysis focus"),
      include_recommendations: z.boolean().optional()
    },
    async (args: Record<string, unknown>): Promise<any> => {
      const filePath = args.file_path as string;
      const analysisType = args.analysis_type as "system" | "performance" | "licensing" | "security";
      const includeRecommendations = (args.include_recommendations as boolean | undefined) ?? true;
      const { cache } = await service.ensureFileInitialized(filePath);
      let lines: string[];
      switch (analysisType) {
        case "system":
          lines = buildSystemHealth(cache, includeRecommendations);
          break;
        case "performance":
          lines = buildPerformanceHealth(cache, includeRecommendations);
          break;
        case "licensing":
          lines = buildLicensingHealth(cache, includeRecommendations);
          break;
        case "security":
        default:
          lines = buildSecurityHealth(cache, includeRecommendations);
          break;
      }
      return textResult(lines);
    }
  );
  registeredTools += 1;

  return registeredTools;
}

function formatInitializationStatus(status: InitializationStatus, ready: boolean): string[] {
  const lines: string[] = [];
  lines.push(`# Initialization Status`);
  lines.push(`Status: ${status.status}`);
  lines.push(`Progress: ${status.progress}%`);
  lines.push(`Stage: ${status.stage}`);
  lines.push(`Activity: ${status.current_activity}`);
  lines.push(`Sections processed: ${status.sections_processed}/${status.total_sections}`);
  lines.push(`Ready for tools: ${ready ? "YES" : "NO"}`);
  if (status.estimated_completion) {
    const remaining = Math.max(0, Math.round(status.estimated_completion - Date.now() / 1000));
    lines.push(`Estimated time remaining: ${remaining} seconds`);
  }
  return lines;
}

function buildSystemHealth(cache: FileProcessingCache, includeRecommendations: boolean): string[] {
  const lines: string[] = [];
  lines.push(`# System Health Overview`);
  const summary = cache.semantic_analysis;
  if (!summary) {
    lines.push("Semantic summary unavailable.");
    return lines;
  }
  lines.push(`Total sections: ${formatNumber(summary.total_sections)}`);
  lines.push(`Known categories: ${Object.keys(summary.categories).length}`);
  lines.push("");
  lines.push("Key categories:");
  Object.entries(summary.categories)
    .filter(([category]) => ["system_info", "network", "performance"].includes(category))
    .forEach(([category, count]) => lines.push(`- ${category}: ${formatNumber(count)}`));
  if (includeRecommendations) {
    lines.push("");
    lines.push("Recommendations:");
    lines.push("- Review system_info for OS and hardware configuration.");
    lines.push("- Inspect network sections for interface status and routing.");
  }
  return lines;
}

function buildPerformanceHealth(cache: FileProcessingCache, includeRecommendations: boolean): string[] {
  const lines = buildPerformanceSummary(cache.performance_cache);
  if (includeRecommendations) {
    lines.push("Recommendations:");
    lines.push("- Investigate interfaces with high CPU or memory usage.");
    lines.push("- Correlate with system load averages.");
  }
  return lines;
}

function buildLicensingHealth(cache: FileProcessingCache, includeRecommendations: boolean): string[] {
  const lines = buildLicensingSummary(cache.licensing_cache);
  if (includeRecommendations) {
    lines.push("Recommendations:");
    lines.push("- Renew expired licenses promptly.");
    lines.push("- Verify blade enablement aligns with deployment requirements.");
  }
  return lines;
}

function buildSecurityHealth(cache: FileProcessingCache, includeRecommendations: boolean): string[] {
  const lines = buildSecuritySummary(cache.security_cache);
  if (includeRecommendations) {
    lines.push("Recommendations:");
    lines.push("- Review privileged users and permission assignments.");
    lines.push("- Audit authentication logs for anomalies.");
  }
  return lines;
}


const MANUAL_CATEGORY_HINTS: Record<string, string> = {
  system_info: "**system_info** - System information, version, hardware",
  performance: "**performance** - CPU, memory, performance metrics",
  network: "**network** - Network interfaces, routing, connectivity",
  security: "**security** - User accounts, permissions, security settings",
  licensing: "**licensing** - License information, blade entitlements",
  configuration: "**configuration** - System configuration, policies",
  vpn: "**vpn** - VPN tunnels, IPSec configuration",
  firewall: "**firewall** - Firewall rules, access control",
  processes: "**processes** - Process information, services",
  database: "**database** - Database information",
  monitoring: "**monitoring** - Monitoring, alerts, SNMP",
  log_files: "**log_files** - Log files and log analysis",
  diagnostics: "**diagnostics** - Diagnostic information",
  command_output: "**command_output** - Command outputs and results",
  core_dumps: "**core_dumps** - Core dumps and crash information"
};

interface ManageUnknownOptions {
  action: "list" | "suggest" | "reclassify" | "bulk_reclassify";
  sectionName?: string;
  newCategory?: string;
  patternMappings?: Record<string, string>;
  page?: number;
  pageSize?: number;
}

interface CategorizationSuggestion {
  section: string;
  current_type: SectionType;
  suggestions: Array<{ type: SectionType; display_name: string; confidence: number }>;
  pattern_matches: string[];
}

function getCategorizationSuggestionsSafely(
  index: CpInfoAdvancedIndex,
  section: SectionInfo
): CategorizationSuggestion {
  const fn = (index as unknown as { getCategorizationSuggestions?: (section: SectionInfo) => CategorizationSuggestion })
    .getCategorizationSuggestions;

  if (typeof fn === "function") {
    return fn.call(index, section);
  }

  return {
    section: section.name,
    current_type: section.sectionType,
    suggestions: [],
    pattern_matches: []
  };
}

function buildManageUnknownList(index: CpInfoAdvancedIndex, sections: SectionInfo[], page: number, pageSize: number): string[] {
  if (!sections.length) {
    return ["# Unknown Sections", "All sections have been successfully categorized."];
  }
  const { pageItems, totalPages } = paginate(sections, page, pageSize);
  const lines: string[] = [];
  lines.push(`# Unknown Sections`);
  lines.push(`Total: ${formatNumber(sections.length)}`);
  lines.push(`Page ${page}/${totalPages}`);
  lines.push("");

  pageItems.forEach((section, idx) => {
    lines.push(`${idx + 1 + (page - 1) * pageSize}. ${section.name}`);
    lines.push(`   Offset: ${formatNumber(section.startOffset)}`);
    if (section.endOffset) {
      lines.push(`   Size: ${formatNumber(section.endOffset - section.startOffset)} bytes`);
    }
    if (section.metadata?.pattern_type) {
      lines.push(`   Pattern: ${section.metadata.pattern_type}`);
    }
    const suggestions = getCategorizationSuggestionsSafely(index, section);
    const top = suggestions.suggestions?.[0];
    if (top) {
      lines.push(`   Suggested: ${top.display_name} (confidence ${top.confidence})`);
    }
    lines.push("");
  });

  if (totalPages > 1 && page < totalPages) {
    lines.push(`Use page=${page + 1} for more results.`);
  }

  return lines;
}

function buildCategorizationSuggestion(index: CpInfoAdvancedIndex, section: SectionInfo): string[] {
  const details = getCategorizationSuggestionsSafely(index, section);
  const lines: string[] = [];
  lines.push(`# Categorization Suggestions - ${section.name}`);
  lines.push("");
  lines.push(`Current category: ${section.sectionType}`);
  lines.push(`Pattern type: ${section.metadata?.pattern_type ?? "unknown"}`);
  lines.push("");

  if (!details.suggestions.length) {
    lines.push("No suggestions based on section name patterns.");
    lines.push("");
    lines.push("Manual classification options:");
    Object.values(MANUAL_CATEGORY_HINTS).forEach((hint) => lines.push(`- ${hint}`));
    return lines;
  }

  lines.push("Suggested categories:");
  details.suggestions.forEach((entry) => {
    lines.push(`- ${entry.display_name} (confidence ${entry.confidence})`);
  });

  if (details.pattern_matches && details.pattern_matches.length) {
    lines.push("");
    lines.push("Pattern matches:");
    details.pattern_matches.forEach((pattern) => lines.push(`- ${pattern}`));
  }

  return lines;
}

async function handleManageUnknownSections(
  service: CpInfoService,
  filePath: string,
  options: ManageUnknownOptions
): Promise<ToolResult> {
  const { reader, cache } = await service.ensureFileInitialized(filePath);
  const index = reader.getIndex();
  const unknownSections = index.getUnknownSections();

  switch (options.action) {
    case "list": {
      const lines = buildManageUnknownList(index, unknownSections, options.page ?? 1, options.pageSize ?? 20);
      return textResult(lines);
    }
    case "suggest": {
      if (!options.sectionName) {
        return textResult(["section_name is required for the suggest action."]);
      }
      const targetName = options.sectionName.toLowerCase();
      const target = unknownSections.find((section) => section.name.toLowerCase() === targetName);
      if (!target) {
        return textResult([`Unknown section '${options.sectionName}' not found.`]);
      }
      const lines = buildCategorizationSuggestion(index, target);
      return textResult(lines);
    }
    case "reclassify": {
      if (!options.sectionName || !options.newCategory) {
        return textResult(["section_name and new_category are required for the reclassify action."]);
      }
      const targetName = options.sectionName.toLowerCase();
      const target = unknownSections.find((section) => section.name.toLowerCase() === targetName);
      if (!target) {
        return textResult([`Unknown section '${options.sectionName}' not found.`]);
      }
      const key = options.newCategory.toUpperCase() as keyof typeof SectionType;
      const newType = SectionType[key];
      if (!newType) {
        return textResult([`Invalid category '${options.newCategory}'.`]);
      }
      if (!index.reclassifySection(target.name, newType)) {
        return textResult([`Failed to reclassify '${target.name}'.`]);
      }
      const updatedCache = await service.recomputeSemanticSummary(filePath);
      updatedCache.search_cache.clear();
      updatedCache.section_content_cache.clear();
      const lines: string[] = [];
      lines.push(`# Reclassification Complete`);
      lines.push(`Section '${target.name}' reassigned to ${newType}.`);
      lines.push(`Remaining unknown sections: ${formatNumber(index.getUnknownSections().length)}`);
      return textResult(lines);
    }
    case "bulk_reclassify": {
      if (!options.patternMappings || Object.keys(options.patternMappings).length === 0) {
        return textResult(["pattern_mappings is required for the bulk_reclassify action."]);
      }
      const result = index.bulkReclassifyUnknown(options.patternMappings);
      const updatedCache = await service.recomputeSemanticSummary(filePath);
      updatedCache.search_cache.clear();
      updatedCache.section_content_cache.clear();
      const lines: string[] = [];
      lines.push(`# Bulk Reclassification Results`);
      lines.push(`Total unknown before: ${formatNumber(result.total_unknown)}`);
      lines.push(`Reclassified: ${formatNumber(result.reclassified)}`);
      lines.push(`Failed: ${formatNumber(result.failed)}`);
      lines.push(`Remaining unknown sections: ${formatNumber(index.getUnknownSections().length)}`);
      if (result.details.length) {
        lines.push("");
        lines.push("Details:");
        result.details.slice(0, 20).forEach((detail) => {
          const info = detail as Record<string, unknown>;
          const section = typeof info.section === "string" ? info.section : "unknown";
          const pattern = typeof info.pattern === "string" ? info.pattern : "";
          const newType = typeof info.new_type === "string" ? info.new_type : "";
          const successFlag = Boolean(info.success);
          const errorMessage = typeof info.error === "string" ? info.error : "";
          const descriptor = successFlag ? "success" : `failed${errorMessage ? ` - ${errorMessage}` : ""}`;
          const patternDisplay = pattern ? ` (${pattern})` : "";
          const targetType = newType || "unchanged";
          lines.push(`- ${section}${patternDisplay} -> ${targetType} : ${descriptor}`);
        });
        if (result.details.length > 20) {
          lines.push(`... ${result.details.length - 20} additional entries truncated.`);
        }
      }
      return textResult(lines);
    }
    default:
      return textResult([`Unsupported action '${options.action}'.`]);
  }
}
