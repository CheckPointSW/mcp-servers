import { promises as fs } from "fs";
import { performance } from "perf_hooks";
import { SectionInfo, SectionType } from "./types.js";
import { CpInfoIndexError } from "./cpinfo-exceptions.js";
import { createLogger } from "./logger.js";
import {
  CPINFO_PATTERNS,
  EXTENSION_TYPE_MAPPING,
  KEYWORD_PATTERNS,
  PATTERN_PRIORITY,
  SECTION_TYPE_MAPPING,
  SPECIAL_SECTION_OVERRIDES
} from "./cpinfo-index-constants.js";

const logger = createLogger("cpinfo-index");

export interface BuildIndexOptions {
  encoding?: BufferEncoding;
  chunkSize?: number;
}

export class CpInfoAdvancedIndex {
  public filePath?: string;
  public fileSize = 0;
  public encoding: BufferEncoding = "utf-8";
  private built = false;
  private sections = new Map<string, SectionInfo>();
  private sectionsByType = new Map<SectionType, SectionInfo[]>();
  private allSections: SectionInfo[] = [];
  private stats = {
    totalSections: 0,
    sectionsByType: new Map<SectionType, number>(),
    processingTime: 0
  };

  constructor() {
    this.initializeTypeMaps();
  }

  get isBuilt(): boolean {
    return this.built;
  }

  getStats(): Record<string, unknown> {
    return {
      totalSections: this.stats.totalSections,
      processingTime: this.stats.processingTime,
      sectionsByType: Object.fromEntries(Array.from(this.stats.sectionsByType.entries()).map(([key, value]) => [key, value]))
    };
  }

  getAllSections(): SectionInfo[] {
    return [...this.allSections];
  }

  getSectionsByType(type: SectionType): SectionInfo[] {
    return [...(this.sectionsByType.get(type) ?? [])];
  }

  getUnknownSections(): SectionInfo[] {
    return this.getSectionsByType(SectionType.UNKNOWN);
  }

  findSectionsContaining(keyword: string, caseSensitive = false): SectionInfo[] {
    const term = caseSensitive ? keyword : keyword.toLowerCase();
    return this.allSections.filter((section) => {
      const name = caseSensitive ? section.name : section.name.toLowerCase();
      return name.includes(term);
    });
  }

  searchSections(query: string, sectionType?: SectionType, page = 1, pageSize = 20) {
    const term = query.toLowerCase();
    const filtered = this.allSections.filter((section) => {
      if (sectionType && section.sectionType !== sectionType) {
        return false;
      }
      return section.name.toLowerCase().includes(term);
    });

    const totalCount = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const pageSections = filtered.slice(startIdx, endIdx);

    return {
      query,
      sections: pageSections.map((section) => ({
        id: section.startOffset,
        name: section.name,
        type: section.sectionType,
        patternType: String(section.metadata?.pattern_type ?? "unknown"),
        size: (section.endOffset ?? section.startOffset) - section.startOffset,
        startOffset: section.startOffset,
        endOffset: section.endOffset
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        hasNext: endIdx < totalCount,
        hasPrev: page > 1
      }
    };
  }

  getSemanticCategories(): Record<SectionType, string[]> {
    const result: Record<SectionType, string[]> = {} as Record<SectionType, string[]>;
    Object.values(SectionType).forEach((type) => {
      result[type] = this.getSectionsByType(type).map((section) => section.name);
    });
    return result;
  }

  getCategorizationSuggestions(section: SectionInfo) {
    const suggestions: SectionType[] = [];
    const confidence: Record<string, number> = {};
    const patternMatches: string[] = [];
    const lowerName = section.name.toLowerCase();

    SECTION_TYPE_MAPPING.forEach(({ pattern, type }) => {
      if (lowerName.includes(pattern)) {
        suggestions.push(type);
        confidence[type] = (confidence[type] ?? 0) + 2;
        patternMatches.push(pattern);
      }
    });

    Object.entries(KEYWORD_PATTERNS).forEach(([typeKey, keywords]) => {
      keywords.forEach((keyword) => {
        if (lowerName.includes(keyword)) {
          const type = typeKey as SectionType;
          suggestions.push(type);
          confidence[type] = (confidence[type] ?? 0) + 1;
          patternMatches.push(keyword);
        }
      });
    });

    const uniqueSuggestions = Array.from(new Set(suggestions));

    return {
      section: section.name,
      current_type: section.sectionType,
      suggestions: uniqueSuggestions.map((type) => ({
        type,
        display_name: type,
        confidence: confidence[type] ?? 1
      })),
      pattern_matches: Array.from(new Set(patternMatches))
    };
  }

  async buildIndex(filePath: string, options: BuildIndexOptions = {}): Promise<void> {
    const start = performance.now();
    let handle: fs.FileHandle | undefined;

    try {
      this.filePath = filePath;
      this.encoding = options.encoding ?? "utf-8";
      const chunkSize = options.chunkSize ?? 2 * 1024 * 1024;

      handle = await fs.open(filePath, "r");
      const stats = await handle.stat();
      this.fileSize = stats.size;
      
      logger.info(`Building clean cpinfo index for ${this.fileSize.toLocaleString()} byte file`);

      let bytesProcessed = 0;
      let bufferRemainder = Buffer.alloc(0);
      this.sections.clear();
      this.allSections = [];
      this.initializeTypeMaps();

      const buffer = Buffer.alloc(chunkSize);
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, chunkSize, bytesProcessed);
        if (bytesRead === 0) {
          break;
        }

        const chunk = Buffer.concat([bufferRemainder, buffer.subarray(0, bytesRead)]);
        const baseOffset = bytesProcessed - bufferRemainder.length;
        const newSections = this.findSectionsInChunk(chunk, baseOffset);
        this.updateSectionBoundaries(this.allSections, newSections);
        this.allSections.push(...newSections);

        const bufferSize = Math.max(512, Math.min(Math.floor(chunk.length / 2), Math.floor(chunkSize / 2)));
        bufferRemainder = chunk.length > bufferSize ? chunk.subarray(chunk.length - bufferSize) : Buffer.alloc(0);
        bytesProcessed += bytesRead;
        
        // Log progress every 20MB
        if (bytesProcessed % (20 * 1024 * 1024) < chunkSize) {
          const progressPercent = ((bytesProcessed / this.fileSize) * 100).toFixed(1);
          logger.info(`Processed ${bytesProcessed.toLocaleString()} bytes (${progressPercent}% complete, ${this.allSections.length} sections found)`);
        }
      }

      this.finalizeSections();

      this.stats.totalSections = this.allSections.length;
      this.stats.processingTime = (performance.now() - start) / 1000;
      this.built = true;
      
      logger.info(`Clean index built: ${this.allSections.length} sections in ${this.stats.processingTime.toFixed(2)}s`);
    } catch (error) {
      throw new CpInfoIndexError(`Failed to build index: ${(error as Error).message}`);
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch (closeError) {
          logger.error(`Failed to close file handle: ${(closeError as Error).message}`);
        }
      }
    }
  }

  reclassifySection(sectionName: string, newSectionType: SectionType): boolean {
    const target = this.allSections.find((section) => section.name === sectionName);
    if (!target) {
      logger.warning(`Section '${sectionName}' not found for reclassification`);
      return false;
    }

    const oldType = target.sectionType;
    if (oldType === newSectionType) {
      return true;
    }
    
    logger.info(`Reclassified '${sectionName}' from ${oldType} to ${newSectionType}`);

    const oldList = this.sectionsByType.get(oldType) ?? [];
    this.sectionsByType.set(oldType, oldList.filter((section) => section !== target));

    target.sectionType = newSectionType;
    target.metadata = {
      ...target.metadata,
      reclassified: true,
      original_type: oldType,
      reclassification_reason: "manual"
    };

    const newList = this.sectionsByType.get(newSectionType) ?? [];
    newList.push(target);
    this.sectionsByType.set(newSectionType, newList);

    this.stats.sectionsByType.set(oldType, Math.max(0, (this.stats.sectionsByType.get(oldType) ?? 1) - 1));
    this.stats.sectionsByType.set(newSectionType, (this.stats.sectionsByType.get(newSectionType) ?? 0) + 1);

    const key = `${target.startOffset}:${target.name}`;
    this.sections.set(key, target);
    return true;
  }

  bulkReclassifyUnknown(patternMappings: Record<string, string>) {
    const unknownSections = this.getUnknownSections();
    const results = {
      total_unknown: unknownSections.length,
      reclassified: 0,
      failed: 0,
      details: [] as Array<Record<string, unknown>>
    };

    const lowerMappings = Object.entries(patternMappings).map(([pattern, type]) => [pattern.toLowerCase(), type] as const);

    for (const section of unknownSections) {
      const nameLower = section.name.toLowerCase();
      let reclassified = false;

      for (const [pattern, typeName] of lowerMappings) {
        if (!nameLower.includes(pattern)) {
          continue;
        }

        const typeKey = typeName.toUpperCase() as keyof typeof SectionType;
        const newType = SectionType[typeKey];

        if (!newType) {
          results.failed += 1;
          results.details.push({
            section: section.name,
            pattern,
            new_type: typeName,
            success: false,
            error: `Invalid section type: ${typeName}`
          });
          continue;
        }

        try {
          if (this.reclassifySection(section.name, newType)) {
            results.reclassified += 1;
            results.details.push({
              section: section.name,
              pattern,
              new_type: typeName,
              success: true
            });
            reclassified = true;
            break;
          }
        } catch (error) {
          results.failed += 1;
          results.details.push({
            section: section.name,
            pattern,
            new_type: typeName,
            success: false,
            error: (error as Error).message
          });
        }
      }

      if (!reclassified) {
        const suggestions = this.getCategorizationSuggestions(section);
        const top = suggestions.suggestions?.[0];
        if (top && top.confidence >= 2) {
          try {
            const newType = SectionType[top.type.toUpperCase() as keyof typeof SectionType];
            if (newType && this.reclassifySection(section.name, newType)) {
              results.reclassified += 1;
              results.details.push({
                section: section.name,
                pattern: "auto-suggestion",
                new_type: top.type,
                success: true,
                confidence: top.confidence
              });
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return results;
  }

  private initializeTypeMaps(): void {
    this.sectionsByType = new Map();
    this.stats.sectionsByType = new Map();
    Object.values(SectionType).forEach((type) => {
      this.sectionsByType.set(type, []);
      this.stats.sectionsByType.set(type, 0);
    });
  }

  private findSectionsInChunk(chunk: Buffer, baseOffset: number): SectionInfo[] {
    const chunkString = chunk.toString("latin1");
    const matchedOffsets = new Set<number>();
    const found: SectionInfo[] = [];

    CPINFO_PATTERNS.forEach(({ name, regex }) => {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(chunkString)) !== null) {
        const matchOffset = match.index;
        if (matchedOffsets.has(matchOffset)) {
          continue;
        }

        const rawName = match[1] ?? "";
        const sectionName = Buffer.from(rawName, "latin1").toString(this.encoding).trim();
        if (!sectionName) {
          continue;
        }

        matchedOffsets.add(matchOffset);
        const absoluteOffset = baseOffset + matchOffset;
        const sectionType = this.determineSectionType(sectionName);

        const section: SectionInfo = {
          name: sectionName,
          sectionType,
          startOffset: absoluteOffset,
          metadata: { pattern_type: name }
        };

        found.push(section);
      }
    });

    return found.sort((a, b) => a.startOffset - b.startOffset);
  }

  private determineSectionType(name: string): SectionType {
    const lower = name.toLowerCase();

    for (const { regex, type } of SPECIAL_SECTION_OVERRIDES) {
      if (regex.test(name)) {
        return type;
      }
    }

    for (const { regex, type } of EXTENSION_TYPE_MAPPING) {
      if (regex.test(lower)) {
        return type;
      }
    }

    if (lower.includes("/proc/net")) {
      return SectionType.NETWORK;
    }

    if (lower.includes("/proc/stat")) {
      return SectionType.MONITORING;
    }

    const direct = SECTION_TYPE_MAPPING.find(({ pattern }) => lower.includes(pattern));
    if (direct) {
      return direct.type;
    }

    for (const [typeKey, keywords] of Object.entries(KEYWORD_PATTERNS)) {
      if (keywords.some((keyword) => lower.includes(keyword))) {
        return typeKey as SectionType;
      }
    }

    return SectionType.UNKNOWN;
  }

  private updateSectionBoundaries(existing: SectionInfo[], newSections: SectionInfo[]): void {
    if (!newSections.length) {
      return;
    }

    const sortedNew = [...newSections].sort((a, b) => a.startOffset - b.startOffset);

    sortedNew.forEach((newSection) => {
      const newPriority = PATTERN_PRIORITY[newSection.metadata?.pattern_type as string] ?? 0;

      existing.forEach((section) => {
        if (section.endOffset !== undefined) {
          return;
        }
        if (section.startOffset >= newSection.startOffset) {
          return;
        }

        const sectionPriority = PATTERN_PRIORITY[section.metadata?.pattern_type as string] ?? 0;
        let shouldClose = false;
        if (sectionPriority === 1) {
          // FIX: Allow subsections (priority 3) to close main sections
          // This prevents main sections from absorbing subsection content
          shouldClose = newPriority <= 3;
        } else if (sectionPriority === 2) {
          shouldClose = newPriority <= 2;
        } else {
          shouldClose = true;
        }

        if (shouldClose) {
          section.endOffset = newSection.startOffset;
          section.metadata.boundary_method = "hierarchical_close";
        }
      });
    });
  }

  private finalizeSections(): void {
    const unique = new Map<string, SectionInfo>();
    this.allSections.forEach((section) => {
      const key = `${section.startOffset}:${section.name}`;
      if (!unique.has(key)) {
        unique.set(key, section);
      }
    });

    this.allSections = Array.from(unique.values()).sort((a, b) => a.startOffset - b.startOffset);
    
    logger.info(`Finalized ${this.allSections.length} sections (before filtering empty sections)`);

    for (let i = 0; i < this.allSections.length; i += 1) {
      const section = this.allSections[i];
      if (section.endOffset === undefined) {
        let nextSection: SectionInfo | undefined;
        for (let j = i + 1; j < this.allSections.length; j += 1) {
          const candidate = this.allSections[j];
          const sectionPriority = PATTERN_PRIORITY[section.metadata?.pattern_type as string] ?? 2;
          const candidatePriority = PATTERN_PRIORITY[candidate.metadata?.pattern_type as string] ?? 2;

          let shouldClose = false;
          if (sectionPriority === 1) {
            // FIX: Allow subsections (priority 3) to close main sections
            // This prevents main sections from absorbing subsection content
            shouldClose = candidatePriority <= 3;
          } else if (sectionPriority === 2) {
            shouldClose = candidatePriority <= 2;
          } else {
            shouldClose = true;
          }

          if (shouldClose) {
            nextSection = candidate;
            break;
          }
        }

        if (nextSection) {
          section.endOffset = nextSection.startOffset;
          section.metadata.boundary_method = "hierarchical_chunk_close";
        } else {
          section.endOffset = this.fileSize;
          section.metadata.boundary_method = "file_end";
        }
      }

      const key = `${section.startOffset}:${section.name}`;
      this.sections.set(key, section);
    }

    // Filter out empty sections (sections with very little content, likely just headers)
    const MIN_SECTION_SIZE = 100; // Minimum bytes for a section to be considered non-empty
    const beforeFilter = this.allSections.length;
    this.allSections = this.allSections.filter((section) => {
      const size = (section.endOffset ?? section.startOffset) - section.startOffset;
      if (size < MIN_SECTION_SIZE) {
        logger.debug(`Filtering out empty section: ${section.name} (${size} bytes)`);
        return false;
      }
      return true;
    });
    
    if (beforeFilter !== this.allSections.length) {
      logger.info(`Filtered out ${beforeFilter - this.allSections.length} empty sections`);
    }

    this.rebuildTypeIndexes();
    
    // Log section summary
    logger.info("Clean section summary by type:");
    this.sectionsByType.forEach((sections, type) => {
      if (sections.length > 0) {
        logger.info(`  ${type}: ${sections.length} sections`);
      }
    });
  }

  private rebuildTypeIndexes(): void {
    this.initializeTypeMaps();
    this.allSections.forEach((section) => {
      const list = this.sectionsByType.get(section.sectionType) ?? [];
      list.push(section);
      this.sectionsByType.set(section.sectionType, list);
      this.stats.sectionsByType.set(section.sectionType, (this.stats.sectionsByType.get(section.sectionType) ?? 0) + 1);
    });
  }
}
