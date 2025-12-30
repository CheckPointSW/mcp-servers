/**
 * TypeScript types and interfaces converted from Python Pydantic models.
 * Original source: argos-erm-mcp/src/mcp_server_argos/schemas.py
 * 
 * This file contains all type definitions for the Argos ERM API including:
 * - Alert types, filters, and responses
 * - Asset types and responses
 * - IOC (Indicators of Compromise) types
 * - Exposed credentials types
 * - Threat landscape news types
 * - CVE (Common Vulnerabilities and Exposures) types
 * - Threat actor types
 * - Malware types
 */

// --- General ---
export interface Message {
  role: string;
  content: string;
}

// --- Alerts ---
export enum AlertStatus {
  OPEN = "open",
  ACKNOWLEDGED = "acknowledged",
  CLOSED = "closed"
}

export enum AlertSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  VERY_HIGH = "very_high"
}

export enum AlertSourceCategory {
  FORUM = "forum",
  DARKNET = "darknet",
  PASTE_SITE = "paste_site",
  FILE_SHARING = "file_sharing",
  DEFACE_SITE = "deface_site",
  BLOG = "blog",
  MARKETPLACE = "marketplace",
  CVV_SHOP = "cvv_shop",
  SOCIAL_NETWORK = "social_network",
  CODE_REPOSITORY = "code_repository",
  CHAT = "chat",
  SEARCH_ENGINE = "search_engine",
  ANTIVIRUS_REPOSITORY = "antivirus_repository",
  MALWARE_LOG = "malware_log",
  ONLINE_PROTECTION = "online_protection",
  APP_STORE = "app_store",
  PHISHING_DETECTION = "phishing_detection",
  WHOIS = "whois",
  ATTACK_SURFACE_MONITORING = "attack_surface_monitoring",
  AV_SCANNED_FILES = "av_scanned_files",
  DUMP = "dump",
  OTHER_INTEL_ITEMS = "other_intel_items",
  RANSOMWARE = "ransomware",
  LEAKED_DATA = "leaked_data",
  BREACH_MONITOR = "breach_monitor"
}

export enum AlertImpact {
  REVENUE_LOSS = "revenue_loss",
  CUSTOMER_CHURN = "customer_churn",
  ACCOUNT_TAKEOVER = "account_takeover",
  USER_DATA_COMPROMISE = "user_data_compromise",
  DATA_COMPROMISE = "data_compromise",
  UNAUTHORIZED_ACCESS = "unauthorized_access",
  FINANCIAL_PENALTIES = "financial_penalties",
  COMPETITIVE_ADVANTAGE_LOSS = "competitive_advantage_loss",
  SERVICE_DISRUPTION = "service_disruption",
  BRAND_DEGRADATION = "brand_degradation"
}

export enum AlertTargetedVector {
  BUSINESS = "business",
  EMPLOYEE = "employee",
  CUSTOMER = "customer"
}

export enum AlertClosureReason {
  RESOLVED = "resolved",
  IRRELEVANT = "irrelevant",
  FALSE_POSITIVE = "false_positive",
  IRRELEVANT_ALERT_SUBTYPE = "irrelevant_alert_subtype",
  NO_LONGER_A_THREAT = "no_longer_a_threat",
  ASSET_SHOULD_NOT_BE_MONITORED = "asset_should_not_be_monitored",
  ASSET_BELONGS_TO_MY_ORGANIZATION = "asset_belongs_to_my_organization",
  ASM_NO_LONGER_DETECTED = "asm_no_longer_detected",
  ASM_MANUALLY_CLOSED = "asm_manually_closed",
  OTHER = "other"
}

/**
 * Date range filter for alerts API. Both 'from' and 'to' fields are absolutely required.
 */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * Integer range filter.
 */
export interface RangeInt {
  from: number;
  to: number;
}

/**
 * Filters for the alerts API, matching the OpenAPI specification.
 * 
 * Note: The `environments` field is optional for callers, but the runtime will always
 * inject the current environment (derived from the `ARGOS_CUSTOMER_ID` env var) into
 * the request. If a caller supplies their own list, the server logic merges and
 * de-duplicates values so the active environment cannot be omitted.
 */
export interface AlertFilters {
  is_published?: boolean;
  confidence?: RangeInt;
  severity?: AlertSeverity[];
  created_date?: DateRange;
  update_date?: DateRange;
  category?: AlertCategory[];
  type?: string[];
  subtype?: AlertSubType[];
  impact?: AlertImpact[];
  source_category?: AlertSourceCategory[];
  source?: string[];
  status?: AlertStatus[];
  closure_reason?: AlertClosureReason[];
  threat_actor?: string[];
  is_analysis_report?: boolean;
  ref_id?: string[] | string;
  draft_id?: string[] | string;
  id?: number[];
  targeted_brands?: string[];
  tags?: string[];
  acknowledged_by?: string[];
  assigned_to?: string[];
  is_assigned?: boolean;
  related_asset_id?: string[];
  attribute_ids?: number[];
  environments?: string[];
}

/**
 * Pagination for alerts API.
 */
export interface AlertsPagination {
  page_number: number;
  page_size: number;
}

/**
 * Request model for fetching alerts, matching the internal API structure.
 */
export interface GetAlertsRequest {
  customer_id: string;
  pagination: AlertsPagination;
  filters?: AlertFilters;
  exclude_filters?: Record<string, any>;
  sort?: Record<string, string>[];
  with_total: boolean;
}

export interface User {
  id?: number;
  name?: string;
  email: string;
}

/**
 * Pydantic model for a single alert.
 */
export interface Alert {
  id: number;
  environment: string;
  ref_id: string;
  confidence: number;
  status: AlertStatus | string;
  severity: AlertSeverity | string;
  created_date: string;
  created_by: User;
  category: AlertCategory | string;
  type: string;
  source_category: AlertSourceCategory | string;
  source?: string;
  targeted_vectors: (AlertTargetedVector | string)[];
  targeted_brands: string[];
  related_entities: string[];
  impacts: (AlertImpact | string)[];
  acknowledged_date?: string;
  acknowledged_by?: User;
  publish_date?: string;
  title: AlertSubType | string;
  alert_data: Record<string, any>;
  iocs: Record<string, any>[];
  indicators: Record<string, any>[];
  ticket_id?: string;
  threat_actor?: string;
  modification_date: string;
  closure_date?: string;
  closed_by?: User;
  closure_reason?: AlertClosureReason | string;
  closure_reason_description?: string;
  description: string;
  recommendation: string;
  tags: string[];
  analysis_report?: Record<string, any>;
  attachments: Record<string, any>[];
  mitre: string[];
  related_assets: Record<string, any>[];
  update_date: string;
}

/**
 * Response data for fetching alerts.
 */
export interface GetAlertsData {
  filtered_count?: number;
  alerts: Alert[];
}

/**
 * Full response wrapper for fetching alerts.
 */
export interface GetAlertsResponse {
  data: GetAlertsData;
}

export interface GetSingleAlertResponse {
  alert: Alert;
}

// --- Assets ---
export enum AssetTypes {
  ORGANIZATION = "organization",
  DOMAIN = "domain",
  IP = "ip",
  SUBDOMAIN = "subdomain",
  EMAIL = "email",
  URL = "url",
  FILE = "file",
  PHONE = "phone",
  S3_BUCKET = "s3_bucket",
  GOOGLE_CLOUD_STORAGE = "google_cloud_storage",
  AZURE_STORAGE_BLOB = "azure_storage_blob",
  AZURE_DATA_LAKE = "azure_data_lake",
  AWS_ACCOUNT = "aws_account",
  GCP_PROJECT = "gcp_project",
  CLOUDFLARE_ACCOUNT = "cloudflare_account",
  AZURE_SUBSCRIPTION = "azure_subscription"
}

export enum StatusMonitoringTypes {
  MONITORED_ASM_AND_TI = "monitored_asm_and_ti",
  MONITORED_ASM = "monitored_asm",
  PENDING_DECISION = "pending_decision",
  NOT_MONITORED = "not_monitored",
  UNVALIDATED = "unvalidated",
  IRRELEVANT = "irrelevant",
  INACTIVE = "inactive"
}

export interface GetAssetsRequest {
  customer_id: string;
  page_number: number;
  type?: AssetTypes[];
  status: StatusMonitoringTypes[];
  created_from?: string;
  asset_name?: string;
  discovery_precision: number;
}

export interface Asset {
  id: number;
  name?: string;
  type?: AssetTypes | string;
  status?: string;
  asset_group?: string;
  created: string;
  updated: string;
  parent_asset_value?: string;
  discovery_precision?: number;
  discovery_reason?: string;
}

export interface GetAssetsResponse {
  total_assets: number;
  page_number: number;
  assets: Asset[];
}

// --- IOCs ---
export enum IOCType {
  FILE_SHA256 = "file/sha256",
  IPV4 = "ipv4",
  DOMAIN = "domain",
  URL = "url"
}

export interface DetectedActivity {
  type: string;
  observation_date: string;
  description: string;
  confidence: number;
  occurrences_count: number;
}

export interface Risk {
  malicious_score: number;
  detected_activities?: DetectedActivity[];
  occurrences_count: number;
}

export interface WhoisEnrichment {
  registrant_name?: string;
  registrant_email?: string;
  registrant_organization?: string;
  registrant_country?: string;
  registrant_telephone?: string;
  technical_contact_email?: string;
  technical_contact_name?: string;
  technical_contact_organization?: string;
  registrar_name?: string;
  admin_contact_name?: string;
  admin_contact_organization?: string;
  admin_contact_email?: string;
  created_date?: string;
  updated_date?: string;
  expiration_date?: string;
}

export interface DomainEnrichment {
  related_entities?: Record<string, any>[];
  ips?: string[];
  whois?: WhoisEnrichment;
}

export interface FileSha256Enrichment {
  related_entities?: Record<string, any>[];
  filenames?: string[];
  first_seen?: string;
  download_urls?: string[];
}

export interface Ipv4Enrichment {
  related_entities?: Record<string, any>[];
  geo?: Record<string, any>;
  asn?: Record<string, any>;
  suspicious_urls?: string[];
  suspicious_domains?: string[];
}

export interface URLEnrichment {
  related_entities?: Record<string, any>[];
  ips?: string[];
  hostname?: string;
  domain?: string;
}

export interface IOCResponse {
  risk?: Risk;
  benign?: boolean;
}

export interface DomainIOCResponse extends IOCResponse {
  entity: Record<string, any>;
  enrichment?: DomainEnrichment;
}

export interface FileSha256IOCResponse extends IOCResponse {
  entity: Record<string, any>;
  enrichment?: FileSha256Enrichment;
}

export interface Ipv4IOCResponse extends IOCResponse {
  entity: Record<string, any>;
  enrichment?: Ipv4Enrichment;
}

export interface URLIOCResponse extends IOCResponse {
  entity: Record<string, any>;
  enrichment?: URLEnrichment;
}

// --- Exposed Credentials ---
export interface LeakedCredentialEntry {
  password?: string;
  source?: string;
  published_date?: string;
  url?: string;
  url_hostname?: string;
  corporate_confidence_score?: number;
}

export interface LeakedCredentialRecord {
  username: string;
  entries: LeakedCredentialEntry[];
  first_seen?: string;
  last_seen?: string;
}

export interface Employee {
  statistics: Record<string, number>;
  raw_data: LeakedCredentialRecord[];
}

export interface Customer {
  statistics: Record<string, number>;
  raw_data: LeakedCredentialRecord[];
}

export interface ByDomainData {
  employee: Employee;
  customer: Customer;
}

export interface ByEmailBulkData {
  raw_data: LeakedCredentialRecord[];
}

export interface ByDomainRequest {
  domain: string;
}

export interface ByEmailBulkRequest {
  email: string[];
  mask_password: boolean;
}

export interface ResponseByDomainData {
  data?: ByDomainData;
}

export interface ResponseByEmailBulkData {
  data?: ByEmailBulkData;
}

// --- Threat Landscape News ---
export enum NewsSortField {
  CREATED = "created",
  TITLE = "title"
}

export enum SortOrder {
  ASC = "asc",
  DESC = "desc"
}

export interface Sorting {
  field: NewsSortField | string;
  sort_order: SortOrder | string;
}

export interface ExternalFilterFields {
  regions?: string[];
  sectors?: string[];
  labels?: string[];
  date_range?: DateRange;
}

export interface ExternalFilter {
  mode: string;
  fields: ExternalFilterFields;
}

export interface ExternalPagination {
  page_number: number;
  page_size: number;
}

export interface GetNewsRequest {
  pagination: ExternalPagination;
  sort: Sorting[];
  filters: ExternalFilter;
}

export interface ExternalTag {
  value: string;
  type: string;
}

export interface ExternalNews {
  id: string;
  title: string;
  content: string;
  tags: ExternalTag[];
  source?: string;
  labels?: string[];
  created: string;
}

export interface ResponsePagination {
  page_number: number;
  page_size: number;
  total_count: number;
}

export interface ResponseSort {
  field: NewsSortField | string;
  sort_order: SortOrder | string;
}

export interface ResponseExternalFilterFields {
  regions?: string[];
  sectors?: string[];
  labels?: string[];
  date_range: DateRange;
}

export interface ResponseExternalFilter {
  mode: string;
  fields: ResponseExternalFilterFields;
}

export interface PaginatedExternalNews {
  news: ExternalNews[];
  pagination: ResponsePagination;
  sort: ResponseSort[];
  filters: ResponseExternalFilter;
}

export interface GetNewsResponse {
  data: PaginatedExternalNews;
}

export interface ThreatLandscapeMetadataResponse {
  regions: string[];
  sectors: string[];
  labels: string[];
}

// --- CVEs ---
export interface CVSSv2 {
  version?: string;
  vector_string?: string;
  access_vector?: string;
  access_complexity?: string;
  authentication?: string;
  confidentiality_impact?: string;
  integrity_impact?: string;
  availability_impact?: string;
  base_score?: number;
}

export interface CVSSv3 {
  version?: string;
  vector_string?: string;
  attack_vector?: string;
  attack_complexity?: string;
  privileges_required?: string;
  user_interaction?: string;
  scope?: string;
  confidentiality_impact?: string;
  integrity_impact?: string;
  availability_impact?: string;
  base_score?: number;
  base_severity?: string;
}

export interface BaseMetricV2 {
  cvss_v2?: CVSSv2;
  severity?: string;
  exploitability_score?: number;
  impact_score?: number;
  ac_insuf_info?: boolean;
  obtain_all_privilege?: boolean;
  obtain_user_privilege?: boolean;
  obtain_other_privilege?: boolean;
  user_interaction_required?: boolean;
}

export interface BaseMetricV3 {
  cvss_v3?: CVSSv3;
  exploitability_score?: number;
  impact_score?: number;
}

export interface Impact {
  base_metric_v3?: BaseMetricV3;
  base_metric_v2?: BaseMetricV2;
}

export interface CVEDataMeta {
  id?: string;
  assigner?: string;
}

export interface DescriptionDatum {
  lang?: string;
  value?: string;
}

export interface Description {
  description_data?: DescriptionDatum[];
}

export interface ProblemTypeDatum {
  description?: DescriptionDatum[];
}

export interface ProblemType {
  problem_type_data?: ProblemTypeDatum[];
}

export interface ReferenceDatum {
  url?: string;
  name?: string;
  reference_source?: string;
  tags?: string[];
}

export interface References {
  reference_data?: ReferenceDatum[];
}

export interface CVE {
  data_type?: string;
  data_format?: string;
  data_version?: string;
  cve_data_meta?: CVEDataMeta;
  problem_type?: ProblemType;
  references?: References;
  description?: Description;
}

export interface CPEMatchItem {
  version_start_excluding?: string;
  version_start_including?: string;
  version_end_excluding?: string;
  version_end_including?: string;
  vulnerable: boolean;
  cpe23_uri: string;
  cpe_name?: any[];
}

export interface Node {
  operator?: string;
  negate?: boolean;
  children?: Node[];
  cpe_match?: CPEMatchItem[];
}

export interface Configurations {
  cve_data_version: string;
  nodes?: Node[];
}

export interface ResearchContent {
  analysis?: string;
  recommendation?: string;
  is_notable: boolean;
  alias?: string[];
  updated_date: string;
}

export interface ThreatSlim {
  name: string;
  category?: string;
  type?: string;
}

export interface FullMatchCpes {
  vendor?: string;
  product?: string;
  version?: string[];
  version_start_excluding?: string;
  version_start_including?: string;
  version_end_excluding?: string;
  version_end_including?: string;
  cpe23_uri: string;
  vulnerable?: boolean;
}

export interface CVEModelExternal {
  id: string;
  cve: CVE;
  configurations?: Configurations;
  impact?: Impact;
  published_date?: string;
  last_modified_date?: string;
  cyberint_score?: number;
  cyberint_score_modification_date?: string;
  research_content?: ResearchContent;
  known_exploited_vulnerability?: boolean;
  threats?: ThreatSlim[];
  cpes?: FullMatchCpes[];
}

export interface VulnerabilityDetail {
  cve_id: string;
  cyberint_score: number;
  cvss?: Record<string, any>;
  epss?: number;
  description?: string;
  last_updated: string;
  published: string;
  exploited_by?: ThreatSlim[];
  products?: string[];
  impact?: string;
  recommendation?: string;
  risk_factors?: string[];
  cpes: Record<string, any>[];
  cwes?: Record<string, any>[];
  references?: Record<string, any>[];
}

export interface SearchVulnerabilitiesFilters {
  technology_name: string;
  technology_versions: string[];
  cve_id?: string;
  cvss_min?: number;
  last_updated_from?: string;
  published_date?: Record<string, string>;
}

export interface PaginationExternalInput {
  page_size: number;
  page_number?: number;
}

export enum VulnerabilitiesSortField {
  LAST_MODIFIED_DATE = "last_modified_date",
  PUBLISHED_DATE = "published_date",
  CVE_ID = "cve_id",
  CVSS = "cvss",
  CYBERINT_SCORE = "cyberint_score"
}

export interface SearchVulnerabilitiesSort {
  sort_field: VulnerabilitiesSortField | string;
  sort_order: SortOrder | string;
}

export interface FetchCVEsByTechnologyRequest {
  filters: SearchVulnerabilitiesFilters;
  pagination: PaginationExternalInput;
  sort: SearchVulnerabilitiesSort[];
}

export interface PaginationExternalOutput {
  page_size?: number;
  current_page?: number;
  total_items?: number;
  total_pages?: number;
}

export interface VulnerabilitiesResponse {
  vulnerabilities: VulnerabilityDetail[];
  paging: PaginationExternalOutput;
}

// --- Threat Actors ---
export enum FilterMode {
  OR = "or",
  AND = "and"
}

export interface ThreatActorsFilterFields {
  countries?: string[];
  sectors?: string[];
}

export interface ThreatActorsFilter {
  mode: FilterMode | string;
  fields: ThreatActorsFilterFields;
}

export interface ThreatActorsMetadataResponse {
  countries: string[];
  sectors: string[];
}

export interface ExternalThreatActorWithAttackCount {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
  motivation?: string;
  resource_level?: string;
  attacks_on_countries: number;
  attacks_on_sectors: number;
}

export interface GetMostActiveThreatActorsResponse {
  threat_actors: ExternalThreatActorWithAttackCount[];
  filters?: ThreatActorsFilter;
}

export interface TargetedCountry {
  id: string;
  name: string;
  attacks_count: number;
  country_code?: string;
}

export interface TargetedSector {
  id: string;
  name: string;
  attacks_count: number;
}

export interface DetailedThreatActor {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
  motivation?: string;
  description?: string;
  targeted_countries?: TargetedCountry[];
  targeted_sectors?: TargetedSector[];
}

// --- Malware ---
export interface GetMalwareReponse {
  id: string;
  first_seen?: string;
  last_seen?: string;
  name: string;
  description: string;
  type?: string;
  aliases?: string[];
  is_popular: boolean;
}
