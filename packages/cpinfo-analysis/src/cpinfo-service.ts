import { performance } from "perf_hooks";
import { setTimeout as delay } from "timers/promises";
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
  SectionType,
  SecurityCache,
  SemanticSummary
} from "./types.js";
import { createLogger } from "./logger.js";

const logger = createLogger("cpinfo-service");

const DEFAULT_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const EVICTION_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const PROCESSING_WAIT_ATTEMPTS = 30;

interface CacheMetadata {
  lastAccess: number;
}

export class CpInfoService {
  private readerCache = new Map<string, Promise<CpInfoReader>>();
  private processingCache = new Map<string, FileProcessingCache>();
  private statusCache = new Map<string, InitializationStatus>();
  private metadata = new Map<string, CacheMetadata>();
  private readonly cacheTtlMs: number;
  private evictionPromise: Promise<void> | null = null;
  private lastEvictionCheck = 0;
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor() {
    const envValue = process.env.CPINFO_CACHE_TTL_MS;
    const hasEnv = typeof envValue !== "undefined";
    const parsed = hasEnv ? Number(envValue) : NaN;
    const isValid = !Number.isNaN(parsed) && parsed > 0;

    this.cacheTtlMs = isValid ? parsed : DEFAULT_CACHE_TTL_MS;

    if (hasEnv && isValid) {
      logger.info(`Configured cpinfo cache TTL: ${this.cacheTtlMs}ms`);
    } else if (hasEnv && !isValid) {
      logger.warning(`Invalid CPINFO_CACHE_TTL_MS value "${envValue}" — falling back to default ${this.cacheTtlMs}ms`);
    } else {
      logger.debug(`Using default cpinfo cache TTL of ${this.cacheTtlMs}ms`);
    }

    this.startEvictionTimer();
  }

  async getReader(filePath: string): Promise<CpInfoReader> {
    await this.maybeEvictStaleCaches();
    if (!this.readerCache.has(filePath)) {
      const reader = new CpInfoReader();
      const promise = reader
        .loadFile(filePath)
        .then(() => reader)
        .catch((error) => {
          this.readerCache.delete(filePath);
          throw error;
        });
      this.readerCache.set(filePath, promise);
    }
    this.touch(filePath);
    return this.readerCache.get(filePath)!;
  }

  getInitializationStatus(filePath: string): InitializationStatus {
    void this.maybeEvictStaleCaches();
    if (!this.statusCache.has(filePath)) {
      this.statusCache.set(filePath, {
        status: ProcessingStatus.NOT_STARTED,
        progress: 0,
        stage: "waiting",
        current_activity: "Not started",
        sections_processed: 0,
        total_sections: 0
      });
    }
    this.touch(filePath);
    return this.statusCache.get(filePath)!;
  }

  getProcessingSnapshot(filePath: string): FileProcessingCache {
    return this.getProcessingCache(filePath);
  }

  async ensureFileInitialized(filePath: string): Promise<{ reader: CpInfoReader; cache: FileProcessingCache }> {
    await this.maybeEvictStaleCaches();
    const reader = await this.getReader(filePath);
    const cache = this.getProcessingCache(filePath);
    const status = this.getInitializationStatus(filePath);

    if (cache.initialized && status.status === ProcessingStatus.COMPLETE) {
      logger.info(`Using cached data for ${filePath}`);
      return { reader, cache };
    }

    if (
      status.status === ProcessingStatus.INDEXING ||
      status.status === ProcessingStatus.CATEGORIZING ||
      status.status === ProcessingStatus.ANALYZING
    ) {
      logger.info(`File ${filePath} is being processed by another request, waiting...`);
      for (let i = 0; i < PROCESSING_WAIT_ATTEMPTS; i += 1) {
        await delay(1000);
        const current = this.getInitializationStatus(filePath);
        if (current.status === ProcessingStatus.COMPLETE) {
          logger.info(`Processing completed while waiting for ${filePath}`);
          return { reader, cache: this.getProcessingCache(filePath) };
        }
      }
      logger.warning(`Timeout waiting for processing completion, starting own processing for ${filePath}`);
    }

    logger.info(`Starting comprehensive initialization for ${filePath}`);
    const processingStart = performance.now();
    this.updateStatus(filePath, ProcessingStatus.INDEXING, 10, "Building index", "Scanning file structure...");

    if (!reader.isIndexBuilt) {
      logger.info("Building file index...");
      await reader.buildIndex();
    }

    logger.info("Pre-categorizing sections...");
    this.updateStatus(filePath, ProcessingStatus.CATEGORIZING, 30, "Categorizing sections", "Analyzing section types...");

    const sectionCounts: Record<string, number> = {};
    let totalSections = 0;
    for (const typeValue of Object.values(SectionType)) {
      const sections = await reader.getSectionsByType(typeValue as SectionType);
      sectionCounts[typeValue] = sections.length;
      totalSections += sections.length;
    }

    this.updateStatus(
      filePath,
      ProcessingStatus.ANALYZING,
      50,
      "Pre-analyzing content",
      `Processing ${totalSections} sections...`,
      Math.floor(totalSections * 0.3),
      totalSections
    );

    logger.info("Pre-caching system information...");
    cache.system_info_cache = await this.precacheSystemInfo(reader);
    this.updateStatus(
      filePath,
      ProcessingStatus.ANALYZING,
      65,
      "Pre-caching data",
      "Caching performance data...",
      Math.floor(totalSections * 0.4),
      totalSections
    );

    logger.info("Pre-caching performance data...");
    cache.performance_cache = await this.precachePerformanceData(reader);
    this.updateStatus(
      filePath,
      ProcessingStatus.ANALYZING,
      80,
      "Pre-caching data",
      "Caching licensing info...",
      Math.floor(totalSections * 0.5),
      totalSections
    );

    logger.info("Pre-caching licensing information...");
    cache.licensing_cache = await this.precacheLicensingInfo(reader);
    this.updateStatus(
      filePath,
      ProcessingStatus.ANALYZING,
      90,
      "Pre-caching data",
      "Caching security settings...",
      Math.floor(totalSections * 0.7),
      totalSections
    );

    logger.info("Pre-caching security information...");
    cache.security_cache = await this.precacheSecurityInfo(reader);
    logger.info("Pre-caching core dump analysis...");
    cache.core_dumps_cache = await this.precacheCoreDumps(reader);
    logger.info("Pre-caching network information...");
    cache.network_cache = await this.precacheNetworkInfo(reader);

    cache.semantic_analysis = {
      total_sections: totalSections,
      section_types: sectionCounts,
      file_size: reader.fileSizeBytes,
      processing_time: (performance.now() - processingStart) / 1000,
      categories: Object.fromEntries(
        Object.entries(sectionCounts).filter(([, count]) => count > 0)
      )
    };

    cache.initialized = true;
    cache.cache_timestamp = Date.now() / 1000;

    const totalTime = ((performance.now() - processingStart) / 1000).toFixed(2);
    logger.info(`File initialization complete for ${filePath} in ${totalTime}s`);

    this.updateStatus(
      filePath,
      ProcessingStatus.COMPLETE,
      100,
      "Complete",
      `Initialized ${totalSections} sections in ${totalTime}s`,
      totalSections,
      totalSections
    );

    return { reader, cache };
  }

  async recomputeSemanticSummary(filePath: string): Promise<FileProcessingCache> {
    const reader = await this.getReader(filePath);
    const cache = this.getProcessingCache(filePath);
    const sectionCounts: Record<string, number> = {};
    let totalSections = 0;
    for (const typeValue of Object.values(SectionType)) {
      const sections = await reader.getSectionsByType(typeValue as SectionType);
      sectionCounts[typeValue] = sections.length;
      totalSections += sections.length;
    }

    cache.semantic_analysis = {
      total_sections: totalSections,
      section_types: sectionCounts,
      file_size: reader.fileSizeBytes,
      processing_time: cache.semantic_analysis?.processing_time ?? 0,
      categories: Object.fromEntries(
        Object.entries(sectionCounts).filter(([, count]) => count > 0)
      )
    };

    return cache;
  }

  private getProcessingCache(filePath: string): FileProcessingCache {
    void this.maybeEvictStaleCaches();
    if (!this.processingCache.has(filePath)) {
      this.processingCache.set(filePath, {
        semantic_analysis: null,
        system_info_cache: null,
        performance_cache: null,
        licensing_cache: null,
        security_cache: null,
        core_dumps_cache: null,
        network_cache: null,
        search_cache: new Map(),
        section_content_cache: new Map(),
        cross_analysis_cache: new Map(),
        initialized: false,
        cache_timestamp: null
      });
    }
    this.touch(filePath);
    return this.processingCache.get(filePath)!;
  }

  private updateStatus(
    filePath: string,
    status: ProcessingStatus,
    progress: number,
    stage: string,
    activity: string,
    sectionsProcessed = 0,
    totalSections = 0
  ): void {
    const statusEntry = this.getInitializationStatus(filePath);
    const now = Date.now() / 1000;
    statusEntry.status = status;
    statusEntry.progress = progress;
    statusEntry.stage = stage;
    statusEntry.current_activity = activity;
    statusEntry.sections_processed = sectionsProcessed;
    statusEntry.total_sections = totalSections;
    statusEntry.last_update = now;

    if (status === ProcessingStatus.INDEXING && !statusEntry.start_time) {
      statusEntry.start_time = now;
    }

    if (statusEntry.start_time && progress > 0) {
      const elapsed = now - statusEntry.start_time;
      const estimatedTotal = elapsed * (100 / progress);
      statusEntry.estimated_completion = statusEntry.start_time + estimatedTotal;
    }
  }

  private touch(filePath: string): void {
    this.metadata.set(filePath, { lastAccess: Date.now() });
  }

  private async maybeEvictStaleCaches(): Promise<void> {
    const now = Date.now();
    if (now - this.lastEvictionCheck < EVICTION_CHECK_INTERVAL_MS) {
      return;
    }

    this.lastEvictionCheck = now;
    if (this.evictionPromise) {
      await this.evictionPromise;
      return;
    }

    this.evictionPromise = this.evictStaleCaches(now).finally(() => {
      this.evictionPromise = null;
    });
    await this.evictionPromise;
  }

  private async evictStaleCaches(referenceTime: number): Promise<void> {
    const cutoff = referenceTime - this.cacheTtlMs;
    const staleEntries: string[] = [];

    for (const [filePath, data] of this.metadata.entries()) {
      if (data.lastAccess < cutoff) {
        staleEntries.push(filePath);
      }
    }

    if (!staleEntries.length) {
      return;
    }

    for (const filePath of staleEntries) {
      const metadata = this.metadata.get(filePath);
      this.metadata.delete(filePath);

      const readerPromise = this.readerCache.get(filePath);
      this.readerCache.delete(filePath);
      this.processingCache.delete(filePath);
      this.statusCache.delete(filePath);

      if (readerPromise) {
        try {
          const reader = await readerPromise;
          await reader.close();
        } catch (error) {
          logger.warning(`Failed to close reader for ${filePath} during eviction: ${(error as Error).message}`);
        }
      }

      const idleMinutes = metadata ? Math.round((referenceTime - metadata.lastAccess) / 60000) : "unknown";
      logger.info(`Evicted cpinfo cache for ${filePath} after ${idleMinutes} minutes of inactivity`);
    }
  }

  private startEvictionTimer(): void {
    if (this.evictionTimer) {
      return;
    }
    this.evictionTimer = setInterval(() => {
      void this.maybeEvictStaleCaches();
    }, EVICTION_CHECK_INTERVAL_MS).unref?.() ?? null;
    logger.debug("Started cpinfo cache eviction timer");
  }

  dispose(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
      logger.debug("Stopped cpinfo cache eviction timer");
    }
  }

  private async precacheSystemInfo(reader: CpInfoReader): Promise<BasicCache> {
    const sections = await reader.getSectionsByType(SectionType.SYSTEM_INFO);
    const cache: BasicCache = {
      sections_count: sections.length,
      sections: [],
      summary: {}
    };

    for (const section of sections.slice(0, 10)) {
      try {
        const size = section.endOffset ? section.endOffset - section.startOffset : 8192;
        const content = await reader.readSectionByOffset(section.startOffset, Math.min(8192, size));
        cache.sections.push({
          name: section.name,
          content,
          offset: section.startOffset,
          size
        });
      } catch (error) {
        logger.warning(`Failed to cache system section ${section.name}: ${(error as Error).message}`);
      }
    }

    return cache;
  }

  private async precachePerformanceData(reader: CpInfoReader): Promise<PerformanceCache> {
    const sections = await reader.getSectionsByType(SectionType.PERFORMANCE);
    const cache: PerformanceCache = {
      sections_count: sections.length,
      sections: [],
      summary: {},
      has_cpu_spikes: false,
      has_memory_issues: false
    };

    for (const section of sections.slice(0, 5)) {
      try {
        const size = section.endOffset ? section.endOffset - section.startOffset : 4000;
        const content = await reader.readSectionByOffset(section.startOffset, Math.min(4000, size));
        cache.sections.push({ name: section.name, content, offset: section.startOffset });
        const lower = content.toLowerCase();
        if (lower.includes("cpu") && (lower.includes("spike") || lower.includes("high"))) {
          cache.has_cpu_spikes = true;
        }
        if (lower.includes("memory") && (lower.includes("leak") || lower.includes("high"))) {
          cache.has_memory_issues = true;
        }
      } catch {
        // ignore
      }
    }

    return cache;
  }

  private async precacheLicensingInfo(reader: CpInfoReader): Promise<LicensingCache> {
    const sections = await reader.getSectionsByType(SectionType.LICENSING);
    const cache: LicensingCache = {
      sections_count: sections.length,
      sections: [],
      summary: {},
      license_tables: [],
      has_expired_licenses: false
    };

    for (const section of sections) {
      try {
        const size = section.endOffset ? section.endOffset - section.startOffset : 8192;
        const content = await reader.readSectionByOffset(section.startOffset, size);
        cache.sections.push({ name: section.name, content, offset: section.startOffset });
        const lower = content.toLowerCase();
        if (content.includes("|") && lower.includes("blade")) {
          cache.license_tables.push(section.name);
        }
        if (lower.includes("expir") || lower.includes("expired")) {
          cache.has_expired_licenses = true;
        }
      } catch {
        // ignore
      }
    }

    return cache;
  }

  private async precacheSecurityInfo(reader: CpInfoReader): Promise<SecurityCache> {
    const sections = await reader.getSectionsByType(SectionType.SECURITY);
    const cache: SecurityCache = {
      sections_count: sections.length,
      sections: [],
      summary: {},
      has_user_info: false,
      has_permission_info: false
    };

    for (const section of sections.slice(0, 8)) {
      try {
        const size = section.endOffset ? section.endOffset - section.startOffset : 6000;
        const content = await reader.readSectionByOffset(section.startOffset, Math.min(6000, size));
        cache.sections.push({ name: section.name, content, offset: section.startOffset });
        const lower = content.toLowerCase();
        if (lower.includes("user")) {
          cache.has_user_info = true;
        }
        if (lower.includes("permission") || lower.includes("group")) {
          cache.has_permission_info = true;
        }
      } catch {
        // ignore
      }
    }

    return cache;
  }

  private async precacheCoreDumps(reader: CpInfoReader): Promise<CoreDumpCache> {
    const sections = await reader.getSectionsByType(SectionType.CORE_DUMPS);
    const cache: CoreDumpCache = {
      sections_count: sections.length,
      sections: [],
      summary: {},
      has_crashes: sections.length > 0,
      crash_summary: []
    };

    for (const section of sections) {
      try {
        const size = section.endOffset ? section.endOffset - section.startOffset : 4000;
        const content = await reader.readSectionByOffset(section.startOffset, Math.min(4000, size));
        cache.sections.push({ name: section.name, content, offset: section.startOffset });
        const lines = content.split("\n");
        for (const line of lines.slice(0, 10)) {
          const lower = line.toLowerCase();
          if (lower.includes("crash") || lower.includes("core") || lower.includes("signal") || lower.includes("segfault")) {
            cache.crash_summary.push(line.trim());
          }
        }
      } catch {
        // ignore
      }
    }

    return cache;
  }

  private async precacheNetworkInfo(reader: CpInfoReader): Promise<NetworkCache> {
    const sections = await reader.getSectionsByType(SectionType.NETWORK);
    const cache: NetworkCache = {
      sections_count: sections.length,
      sections: [],
      summary: {},
      interfaces: [],
      config_issues: []
    };

    for (const section of sections.slice(0, 10)) {
      try {
        const size = section.endOffset ? section.endOffset - section.startOffset : 6000;
        const content = await reader.readSectionByOffset(section.startOffset, Math.min(6000, size));
        cache.sections.push({ name: section.name, content, offset: section.startOffset });
        const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);

        for (const line of lines.slice(0, 30)) {
          const lower = line.toLowerCase();
          if (lower.includes("interface") && lower.includes("status")) {
            cache.interfaces.push({ name: line, status: line });
          }
          if (lower.includes("down") || lower.includes("error") || lower.includes("fail")) {
            cache.config_issues.push(line);
          }
        }
      } catch {
        // ignore
      }
    }

    return cache;
  }
}
