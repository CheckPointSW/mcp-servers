#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ThreatEmulationClient, ThreatEmulationSettings } from './lib/threat-emulation-client.js';
import { calculateMD5 } from './lib/common-utils.js';
import { readFileSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { 
  launchMCPServer, 
  createServerModule,
  SessionContext
} from '@chkp/mcp-utils';

const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);
process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

const server = new McpServer({
    name: 'Check Point Threat Emulation',
    description: 'Check Point Threat Emulation and Anti-Virus scanning service for files',
    version: '0.0.1'
});

// Create a multi-user server module
const serverModule = createServerModule(
  server,
  ThreatEmulationSettings,
  pkg,
  ThreatEmulationClient
);


// Tool: Upload file for analysis
server.tool(
    'upload_file',
    'Upload a file for threat analysis using Check Point Threat Emulation and Anti-Virus (returns upload status immediately, analysis may still be processing). For full scan with automatic waiting, use scan_file instead.',
    {
        file_path: z.string().describe('Path to the file to upload (use this for local files)'),
        file_name: z.string().optional().describe('Name of the file (optional, extracted from path if not provided)'),
        features: z.array(z.enum(['te', 'av'])).optional().default(['te', 'av']).describe('Features to use for analysis'),
        reports: z.array(z.enum(['xml', 'summary'])).optional().default(['xml']).describe('Report types to generate (default: xml only)'),
        md5: z.string().optional().describe('MD5 hash of the file for validation'),
        sha1: z.string().optional().describe('SHA-1 hash of the file for validation'),
        sha256: z.string().optional().describe('SHA-256 hash of the file for validation')
    },
    async (args: Record<string, unknown>, extra: any) => {
        
        try {
            const filePath = args.file_path as string;
            const features = (args.features as string[]) || ['te', 'av'];
            const reports = (args.reports as string[]) || ['xml'];

            // Validate that exactly one input method is provided
            if (!filePath) {
                return { content: [{ type: 'text', text: JSON.stringify({ error: 'file_path is required' }, null, 2) }] };
            }

            // Validate file exists
            try {
                statSync(filePath);
            } catch {
                return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }, null, 2) }] };
            }

            const actualFilePath = filePath;
            const actualFileName = (args.file_name as string) || basename(actualFilePath);

            // Rest of your existing upload logic (unchanged)
            const hashes: any = {};
            if (args.md5) hashes.md5 = args.md5;
            if (args.sha1) hashes.sha1 = args.sha1;
            if (args.sha256) hashes.sha256 = args.sha256;

            // Calculate MD5 if not provided (important for AV analysis)
            if (!hashes.md5) {
                console.error('Calculating MD5 for file upload');
                hashes.md5 = calculateMD5(actualFilePath);
            }

            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ThreatEmulationClient(settings);
            const result = await client.uploadFile(actualFilePath, actualFileName, features, hashes, reports);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'File uploaded successfully',
                        response: result,
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Upload failed: ${error.message}` }, null, 2) }] };
        }
    }
);

// Tool: Query file analysis results
server.tool(
    'query_file',
    `Query analysis results for a file using its hash(es). At least one hash is required. For Anti-Virus analysis, MD5 hash is required (will be auto-retrieved if not provided).

    CRITICAL: Understanding report availability:
    - Report IDs (xml_report) are ONLY in: response.te.images[].report.xml_report
    - Report IDs are ONLY available when status.code = 1001 (FOUND)
    - PARTIALLY_FOUND (1006) = file exists but no report IDs available
    - Image IDs (like '3ff3ddae-e7fd-4969-818c-d5f1a2be336d') are NOT report IDs!
    
    Note: Reports are only generated for malicious files. The response contains:
    - te.combined_verdict: Overall file safety verdict (PRESENT THIS TO USERS)
    - te.images[]: Per-environment analysis details (INTERNAL USE ONLY)
    
    Report Selection Process (for FOUND malicious files only):
    STEP 1: Verify status.code = 1001 (FOUND) - if not, no reports available
    STEP 2: Check te.combined_verdict = 'malicious' - if not, no reports needed
    STEP 3: Find images where report.verdict = 'malicious' AND report.xml_report exists
    STEP 4: If image '3ff3ddae-e7fd-4969-818c-d5f1a2be336d' exists and is malicious, use its report.xml_report
    STEP 5: Otherwise, use the first malicious image's report.xml_report value
    STEP 6: Tell user: "Detailed analysis report available" (do NOT include the report ID)

    USER EXPERIENCE RULES:
    - ONLY present results based on te.combined_verdict
    - NEVER mention "environments", "images", or "multiple analysis"
    - NEVER show cryptic image IDs or technical analysis details to users
    - IGNORE "score" field in responses (unreliable/placeholder value)
    - For PARTIALLY_FOUND: explain file needs to be re-scanned for full results
    - NEVER mention report IDs to users - just say "detailed analysis available" if needed`,
    {
        file_name: z.string().optional().describe('Name of the file (optional - helpful for context)'),
        file_path: z.string().optional().describe('Path to file if available - used to calculate MD5 if not provided'),
        features: z.array(z.enum(['te', 'av'])).optional().default(['te', 'av']).describe('Features to query for'),
        md5: z.string().optional().describe('MD5 hash of the file (required for Anti-Virus analysis)'),
        sha1: z.string().optional().describe('SHA-1 hash of the file'),
        sha256: z.string().optional().describe('SHA-256 hash of the file'),
        reports: z.array(z.enum(['xml', 'summary'])).optional().default(['xml']).describe('Report types to query (default: xml only)'),
        images: z.array(z.object({
            id: z.string().describe('Image ID (e.g., "5e5de275-a103-4f67-b55b-47532918fa59")'),
            revision: z.number().describe('Image revision (typically 1)')
        })).optional().describe('Optional: Use only if getting PARTIALLY_FOUND responses. Must match the images used during upload of this file. Check upload response for image IDs where status is "found".')
    },
    async (args: Record<string, unknown>, extra: any) => {
        try {
            const fileName = args.file_name as string;
            const filePath = args.file_path as string;
            const features = (args.features as string[]) || ['te', 'av'];
            const images = args.images as { id: string; revision: number }[] | undefined;
            const reports = (args.reports as string[]) || ['xml'];

            // Collect all provided hashes
            const hashes: { md5?: string; sha1?: string; sha256?: string } = {};
            if (args.md5) hashes.md5 = args.md5 as string;
            if (args.sha1) hashes.sha1 = args.sha1 as string;
            if (args.sha256) hashes.sha256 = args.sha256 as string;

            // Validate at least one hash is provided
            if (!hashes.md5 && !hashes.sha1 && !hashes.sha256) {
                return { content: [{ type: 'text', text: JSON.stringify({ error: 'At least one hash (md5, sha1, or sha256) must be provided' }, null, 2) }] };
            }

            // If MD5 missing but file path provided, calculate it
            if (!hashes.md5 && filePath && features.includes('av')) {
                try {
                    statSync(filePath);
                    console.error('Calculating MD5 from file for AV analysis');
                    hashes.md5 = calculateMD5(filePath);
                } catch (e) {
                    console.error('File not found for MD5 calculation, proceeding without it');
                }
            }

            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ThreatEmulationClient(settings);
            let result = await client.queryFile(features, hashes, images, fileName, reports);

            // If AV failed due to missing MD5, but response includes MD5, retry
            if (features.includes('av') && !hashes.md5 && result.response?.md5) {
                console.error('Retrying with MD5 from response for complete AV analysis');
                hashes.md5 = result.response.md5;
                result = await client.queryFile(features, hashes, images, fileName, reports);
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Query completed',
                        response: result
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Query failed: ${error.message}` }, null, 2) }] };
        }
    }
);

// Tool: Scan file (combined upload + query with smart timeout)
server.tool(
    'scan_file',
    'Full scan of a file for threats using Check Point Threat Emulation and Anti-Virus. Checks if already analyzed, uploads if needed, and waits up to 30 seconds for results. Used when asked for the FULL scan or FULL analysis.',
    {
        file_path: z.string().describe('Path to the file to scan'),
        file_name: z.string().optional().describe('Name of the file (optional for file_path)'),
        wait_timeout: z.number().optional().default(30).describe('Maximum seconds to wait for results (default: 30)'),
        reports: z.array(z.enum(['xml', 'summary', 'tar'])).optional().default(['xml']).describe('Report types to generate (default: xml only)')
    },
    async (args: Record<string, unknown>, extra: any) => {
        
        try {
            const filePath = args.file_path as string;
            const timeout = (args.wait_timeout as number) || 30;
            const reports = (args.reports as string[]) || ['xml'];
            
            if (!filePath) {
                return { content: [{ type: 'text', text: JSON.stringify({ error: 'file_path is required' }, null, 2) }] };
            }

            // Validate file exists
            try {
                statSync(filePath);
            } catch {
                return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }, null, 2) }] };
            }

            const actualFilePath = filePath;
            const actualFileName = (args.file_name as string) || basename(actualFilePath);

            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ThreatEmulationClient(settings);
            const md5 = calculateMD5(actualFilePath);
            
            // Check if already analyzed with specified reports
            try {
                const existingResult = await client.queryFile(['te', 'av'], { md5 }, undefined, actualFileName, reports);
                
                if (existingResult.response?.status?.code === 1001) {
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                message: 'File already analyzed',
                                response: existingResult,
                            }, null, 2)
                        }]
                    };
                } else if (existingResult.response?.status?.code === 1006) {
                    console.error('File found with different report configuration, using existing analysis');
                    console.error('Unable to get complete results with existing analysis, proceeding with new upload');
                }
            } catch (e) {
                // Not found, continue to upload
            }
            
            // Upload file with specified reports
            const uploadResult = await client.uploadFile(actualFilePath, actualFileName, ['te', 'av'], { md5 }, reports);
            
            if (uploadResult.response?.status?.code !== 1002) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: `Upload failed: ${uploadResult.response?.status?.message}`
                        }, null, 2)
                    }]
                };
            }
            
            // Poll for results
            const startTime = Date.now();
            
            while ((Date.now() - startTime) / 1000 < timeout) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const result = await client.queryFile(['te', 'av'], { md5 }, undefined, actualFileName, reports);
                
                if (result.response?.status?.code === 1001) {
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                message: 'Scan completed',
                                response: result,
                            }, null, 2)
                        }]
                    };
                }
            }
            
            // Timeout
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'File uploaded. Analysis in progress',
                        status: 'processing',
                        file_name: actualFileName,
                        md5: md5,
                    }, null, 2)
                }]
            };
            
        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Scan failed: ${error.message}` }, null, 2) }] };
        }
    }
);

// Tool: Download report
server.tool(
    'download_report',
    `Download detailed analysis report using xml_report ID from a FOUND query result.

    CRITICAL: 
    - Report ID must come from: response.te.images[].report.xml_report
    - NOT from image IDs (like '3ff3ddae-e7fd-4969-818c-d5f1a2be336d')
    - Only available when query returns status = FOUND (1001)
    - PARTIALLY_FOUND responses don't include report IDs

    Example of finding report ID:
    1. Look in te.images[] for image with report.verdict='malicious' 
    2. Get its report.xml_report value (UUID format like 'ef5f38d8-c35e-42fa-b3f1-388e681e18b9')
    3. Use that UUID with this download tool
    
    If no report ID available, user must upload or scan the file to generate new analysis.`,
    {
        report_id: z.string().describe('XML report ID to download. Must be UUID from report.xml_report field, NOT an image ID. Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
    },
    async (args: Record<string, unknown>, extra: any) => {
        try {
            const reportId = args.report_id as string;

            if (!reportId) {
                return { content: [{ type: 'text', text: JSON.stringify({ error: 'report_id is required' }, null, 2) }] };
            }

            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ThreatEmulationClient(settings);
            const result = await client.downloadReport(reportId);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Report downloaded successfully',
                        contentType: result.contentType,
                        contentLength: result.contentLength,
                        dataSize: result.data.length,
                        content: result.data.toString('utf-8')
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Download failed: ${error.message}` }, null, 2) }] };
        }
    }
);

// Tool: Get quota information
server.tool(
    'get_quota',
    'Get API quota and usage information',
    {},
    async (extra: any) => {
        try {
            const settings = SessionContext.getSettings(serverModule, extra);
            const client = new ThreatEmulationClient(settings);
            const result = await client.getQuota();

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Quota information retrieved',
                        quota: result
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Quota request failed: ${error.message}` }, null, 2) }] };
        }
    }
);

export { server };

const main = async () => {
    await launchMCPServer(
        join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
        serverModule
    );
};
main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
