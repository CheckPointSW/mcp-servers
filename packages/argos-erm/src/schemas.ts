/**
 * Zod schemas for runtime validation of Argos ERM API parameters
 * These schemas are used primarily for MCP tool parameter validation
 */

import { z } from 'zod';

// --- Common Schemas ---

/**
 * Schema for date range filters (ISO 8601 format)
 */
export const DateRangeSchema = z.object({
  from: z.string().describe('Start date in ISO 8601 format (e.g., "YYYY-MM-DDTHH:MM:SSZ")'),
  to: z.string().describe('End date in ISO 8601 format (e.g., "YYYY-MM-DDTHH:MM:SSZ")')
});

/**
 * Schema for flexible list parameters - handles JSON strings, arrays, or single values
 */
export const FlexibleListSchema = z.union([
  z.string(),
  z.array(z.string())
]).optional();

// --- Alert Schemas ---

export const AlertStatusSchema = z.enum(['open', 'acknowledged', 'closed']);

export const AlertSeveritySchema = z.enum(['low', 'medium', 'high', 'very_high']);

/**
 * Schema for alert filtering - subset of most commonly used fields
 */
export const AlertFiltersSchema = z.object({
  severities: FlexibleListSchema.describe('Alert severity levels: low, medium, high, very_high'),
  statuses: FlexibleListSchema.describe('Alert status: open, acknowledged, closed'),
  types: FlexibleListSchema.describe('Alert types (e.g., phishing_email, ransomware, etc.)'),
  from_created_date: z.string().optional().describe('Start date for alerts (YYYY-MM-DD)'),
  to_created_date: z.string().optional().describe('End date for alerts (YYYY-MM-DD)'),
  limit: z.number().min(10).default(10).describe('Number of alerts to return (minimum 10)'),
  offset: z.number().default(0).describe('Offset for pagination')
});

// --- Asset Schemas ---

export const AssetTypesSchema = z.enum([
  'organization', 'domain', 'ip', 'subdomain', 'email', 'url', 'file', 'phone',
  's3_bucket', 'google_cloud_storage', 'azure_storage_blob', 'azure_data_lake',
  'aws_account', 'gcp_project', 'cloudflare_account', 'azure_subscription'
]);

export const StatusMonitoringTypesSchema = z.enum([
  'monitored_asm_and_ti', 'monitored_asm', 'pending_decision',
  'not_monitored', 'unvalidated', 'irrelevant', 'inactive'
]);

/**
 * Schema for asset filtering
 */
export const AssetFiltersSchema = z.object({
  page_number: z.number().min(1).default(1).describe('Page number for pagination'),
  asset_type: FlexibleListSchema.describe('Asset types to filter'),
  status: FlexibleListSchema.describe('Monitoring status filter'),
  created_from: z.string().optional().describe('Show assets created after this date (YYYY-MM-DD)'),
  asset_name: z.string().optional().describe('Filter by asset name'),
  discovery_precision: z.number().min(0).max(100).default(0).describe('Minimum discovery confidence (0-100)'),
  fetch_technologies: z.boolean().optional().describe('Include technology stack information')
});

// --- IOC Schemas ---

export const IOCTypeSchema = z.enum(['file/sha256', 'ipv4', 'domain', 'url']);

/**
 * Schema for IOC enrichment
 */
export const IOCEnrichmentSchema = z.object({
  iocs: z.union([z.string(), z.array(z.string())]).describe('Single IOC or list of IOCs (IPs, domains, URLs, file hashes)')
});

// --- Vulnerability Schemas ---

export const VulnerabilitySortFieldSchema = z.enum([
  'last_modified_date', 'published_date', 'cve_id', 'cvss', 'cyberint_score'
]);

export const SortOrderSchema = z.enum(['asc', 'desc']);

/**
 * Schema for CVE search by technology
 */
export const CVESearchSchema = z.object({
  technology_name: z.string().describe('Software product name (e.g., "Apache HTTP Server", "MySQL")'),
  technology_versions: z.union([z.string(), z.array(z.string())]).describe('Version(s) to search'),
  cvss_min: z.union([z.number(), z.string()]).optional().describe('Minimum CVSS score (0.0-10.0)'),
  modified_days_back: z.number().default(365).describe('Search CVEs modified in last N days'),
  page_size: z.number().min(1).max(100).default(50).describe('Results per page'),
  page_number: z.number().min(1).default(1).describe('Page number')
});

// --- Credential Exposure Schemas ---

/**
 * Schema for credential exposure check
 */
export const CredentialExposureSchema = z.object({
  inputs: z.union([z.string(), z.array(z.string())]).describe('Domain(s) or email(s) to check'),
  mask_password: z.boolean().default(true).describe('Mask passwords in results')
});

// --- Threat Intelligence Schemas ---

export const FilterModeSchema = z.enum(['or', 'and']);

/**
 * Schema for threat landscape news filters
 */
export const ThreatNewsFiltersSchema = z.object({
  regions: FlexibleListSchema.describe('Geographic regions filter'),
  sectors: FlexibleListSchema.describe('Industry sectors filter'),
  labels: FlexibleListSchema.describe('Threat categories/tags filter'),
  filter_mode: z.string().default('or').describe('Logical operator: "or" or "and"'),
  from_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  to_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  page: z.number().min(1).default(1).describe('Page number'),
  limit: z.number().min(1).max(100).default(100).describe('Results per page')
});

// --- Threat Actor Schemas ---

/**
 * Schema for threat actor filters
 */
export const ThreatActorFiltersSchema = z.object({
  countries: FlexibleListSchema.describe('Countries filter'),
  sectors: FlexibleListSchema.describe('Industry sectors filter'),
  filter_mode: FilterModeSchema.default('or').describe('Logical operator: "or" or "and"')
});

// --- UUID Validation ---

/**
 * Schema for UUIDv4 validation
 */
export const UUIDSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'Must be a valid UUIDv4'
);

// --- Helper Function ---

/**
 * Parse flexible list parameter that might come as JSON string, array, or single value
 */
export function parseListParam(param: string | string[] | undefined | null): string[] | undefined {
  if (param === null || param === undefined) {
    return undefined;
  }
  
  if (Array.isArray(param)) {
    return param;
  }
  
  if (typeof param === 'string') {
    const trimmed = param.trim();
    // Try to parse as JSON array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        // Fall through to treat as single item
      }
    }
    // Treat as single item
    return [param];
  }
  
  return undefined;
}

/**
 * Validate if a string is a valid UUIDv4
 */
export function isValidUuid4(uuidStr: string): boolean {
  try {
    const result = UUIDSchema.safeParse(uuidStr);
    return result.success;
  } catch {
    return false;
  }
}
