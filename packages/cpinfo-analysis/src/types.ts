export enum ProcessingStatus {
  NOT_STARTED = "not_started",
  INDEXING = "indexing",
  CATEGORIZING = "categorizing",
  ANALYZING = "analyzing",
  COMPLETE = "complete",
  ERROR = "error"
}

export enum SectionType {
  SYSTEM_INFO = "system_info",
  PERFORMANCE = "performance",
  DIAGNOSTICS = "diagnostics",
  SECURITY = "security",
  LICENSING = "licensing",
  NETWORK = "network",
  LOG_FILES = "log_files",
  COMMAND_OUTPUT = "command_output",
  CORE_DUMPS = "core_dumps",
  CONFIGURATION = "configuration",
  VPN = "vpn",
  FIREWALL = "firewall",
  MONITORING = "monitoring",
  DATABASE = "database",
  PROCESSES = "processes",
  UNKNOWN = "unknown"
}

export interface SectionInfo {
  name: string;
  sectionType: SectionType;
  startOffset: number;
  endOffset?: number;
  parentPath?: string[];
  metadata: Record<string, any>;
}

export interface SectionCacheEntry {
  name: string;
  content: string;
  offset: number;
  size?: number;
  metadata?: Record<string, any>;
}

export interface BasicCache {
  sections_count: number;
  sections: SectionCacheEntry[];
  summary?: Record<string, any>;
}

export interface PerformanceCache extends BasicCache {
  has_cpu_spikes: boolean;
  has_memory_issues: boolean;
}

export interface LicensingCache extends BasicCache {
  license_tables: string[];
  has_expired_licenses: boolean;
}

export interface SecurityCache extends BasicCache {
  has_user_info: boolean;
  has_permission_info: boolean;
}

export interface CoreDumpCache extends BasicCache {
  has_crashes: boolean;
  crash_summary: string[];
}

export interface NetworkInterfaceInfo {
  name: string;
  status: string;
  ip?: string;
  type?: string;
}

export interface NetworkCache extends BasicCache {
  interfaces: NetworkInterfaceInfo[];
  config_issues: string[];
}

export interface SemanticSummary {
  total_sections: number;
  section_types: Record<string, number>;
  file_size: number;
  processing_time: number;
  categories: Record<string, number>;
}

export interface FileProcessingCache {
  semantic_analysis: SemanticSummary | null;
  system_info_cache: BasicCache | null;
  performance_cache: PerformanceCache | null;
  licensing_cache: LicensingCache | null;
  security_cache: SecurityCache | null;
  core_dumps_cache: CoreDumpCache | null;
  network_cache: NetworkCache | null;
  search_cache: Map<string, any>;
  section_content_cache: Map<string, SectionCacheEntry>;
  cross_analysis_cache: Map<string, any>;
  initialized: boolean;
  cache_timestamp: number | null;
}

export interface InitializationStatus {
  status: ProcessingStatus;
  progress: number;
  stage: string;
  current_activity: string;
  sections_processed: number;
  total_sections: number;
  start_time?: number;
  estimated_completion?: number;
  last_update?: number;
}

export interface SearchMatch {
  section: SectionInfo;
  matchingLines: string[];
  nameMatched: boolean;
  contentMatched: boolean;
}
