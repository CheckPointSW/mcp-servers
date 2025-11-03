import { promises as fs } from "fs";
import { CpInfoAdvancedIndex, BuildIndexOptions } from "./cpinfo-index.js";
import {
  CpInfoError,
  CpInfoIOError,
  CpInfoEncodingError,
  CpInfoIndexError
} from "./cpinfo-exceptions.js";
import { SectionType, SectionInfo } from "./types.js";
import { createLogger } from "./logger.js";

const logger = createLogger("cpinfo-reader");

export interface ReaderOptions {
  buildIndex?: boolean;
  encoding?: BufferEncoding;
}

export class CpInfoReader {
  public filePath?: string;
  public encoding: BufferEncoding;
  public buildIndexOnLoad: boolean;
  private fileHandle?: fs.FileHandle;
  private fileSize = 0;
  private index?: CpInfoAdvancedIndex;
  private indexBuilt = false;

  constructor(options: ReaderOptions = {}) {
    this.encoding = options.encoding ?? "utf-8";
    this.buildIndexOnLoad = options.buildIndex ?? true;
  }

  async loadFile(filePath: string, options: BuildIndexOptions = {}): Promise<void> {
    logger.info(`Loading cpinfo file: ${filePath}`);
    this.filePath = filePath;
    await this.openFile();

    if (this.buildIndexOnLoad) {
      logger.info("Building index automatically");
      await this.buildIndex(options);
    }
  }

  async close(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = undefined;
    }
    this.indexBuilt = false;
    this.index = undefined;
  }

  getIndex(): CpInfoAdvancedIndex {
    if (!this.index) {
      throw new CpInfoError("Index not available - reader was created with buildIndex=false");
    }
    return this.index;
  }

  get fileSizeBytes(): number {
    return this.fileSize;
  }

  get isIndexBuilt(): boolean {
    return this.indexBuilt;
  }

  async readSectionByOffset(offset: number, size: number): Promise<string> {
    if (!this.fileHandle) {
      await this.openFile();
    }

    if (!this.fileHandle) {
      throw new CpInfoIOError("File handle is not available");
    }

    try {
      const buffer = Buffer.alloc(size);
      const { bytesRead } = await this.fileHandle.read(buffer, 0, size, offset);
      logger.debug(`Read ${bytesRead} bytes from offset ${offset}`);
      return buffer.subarray(0, bytesRead).toString(this.encoding);
    } catch (error) {
      logger.error(`Error reading section at offset ${offset}`, error as Error);
      throw new CpInfoIOError(`Error reading section at offset ${offset}: ${(error as Error).message}`);
    }
  }

  async getSectionsByType(type: SectionType): Promise<SectionInfo[]> {
    const index = this.getIndex();
    return index.getSectionsByType(type);
  }

  async findSectionsContaining(keyword: string, caseSensitive = false): Promise<SectionInfo[]> {
    const index = this.getIndex();
    return index.findSectionsContaining(keyword, caseSensitive);
  }

  async getSemanticCategories(): Promise<Record<SectionType, string[]>> {
    return this.getIndex().getSemanticCategories();
  }

  async buildIndex(options: BuildIndexOptions = {}): Promise<void> {
    if (!this.filePath) {
      throw new CpInfoIOError("File path not set");
    }

    logger.info(`Building index for ${this.filePath}`);

    if (!this.index) {
      this.index = new CpInfoAdvancedIndex();
    }

    await this.index.buildIndex(this.filePath, {
      encoding: options.encoding ?? this.encoding,
      chunkSize: options.chunkSize
    });

    this.indexBuilt = true;
    logger.info(`Index built with ${this.index.getAllSections().length} sections`);
  }

  private async openFile(): Promise<void> {
    if (!this.filePath) {
      throw new CpInfoIOError("File path not provided");
    }

    try {
      this.fileHandle = await fs.open(this.filePath, "r");
      const stats = await this.fileHandle.stat();
      this.fileSize = stats.size;
      logger.info(`Opened cpinfo file: ${this.fileSize.toLocaleString()} bytes`);
    } catch (error) {
      logger.error(`Failed to open file: ${this.filePath}`, error as Error);
      throw new CpInfoIOError(`Failed to open file: ${(error as Error).message}`);
    }
  }
}
