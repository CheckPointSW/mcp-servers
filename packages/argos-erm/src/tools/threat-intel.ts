import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionContext } from '@chkp/mcp-utils';
import { KNOWLEDGEBASE_API_BASE } from '../constants.js';
import { parseListParam, isValidUuid4 } from '../schemas.js';
import type { ServerModule } from './types.js';

export function registerThreatIntelTools(
    server: McpServer,
    serverModule: ServerModule
): void {
    // get_threat_landscape_metadata
    server.registerTool(
        'get_threat_landscape_metadata',
        {
            description: `Get all available filter options for threat intelligence news search.

WHEN TO USE:
- ALWAYS call this BEFORE using get_threat_landscape_news for first time
- User asks "what regions/sectors/labels are available?"`,
        },
        async (extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );
                const response = await apiManager.post(
                    `${KNOWLEDGEBASE_API_BASE}/news/metadata`
                );
                const responseData = await response.json();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                responseData.data || {},
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving threat landscape metadata: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    // get_threat_landscape_news
    server.registerTool(
        'get_threat_landscape_news',
        {
            description: `Retrieve curated threat intelligence news and security reports with advanced filtering.

WHEN TO USE:
- User wants latest threat intelligence or security news
- User asks about threats affecting specific industries or regions
- Use get_threat_landscape_metadata() FIRST to discover available filter options`,
            inputSchema: {
                regions: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe('Geographic regions to filter by.'),
                sectors: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe('Industry sectors to filter by.'),
                labels: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe('Threat categories/tags to filter by.'),
                filter_mode: z
                    .string()
                    .default('or')
                    .describe(
                        'Logical operator for combining filters: "or" or "and".'
                    ),
                from_date: z
                    .string()
                    .optional()
                    .describe('Start date (YYYY-MM-DD).'),
                to_date: z
                    .string()
                    .optional()
                    .describe('End date (YYYY-MM-DD).'),
                page: z.number().default(1).describe('Page number.'),
                limit: z
                    .number()
                    .default(100)
                    .describe('Max articles per page.'),
            },
        },
        async (
            {
                regions,
                sectors,
                labels,
                filter_mode = 'or',
                from_date,
                to_date,
                page = 1,
                limit = 100,
            },
            extra
        ) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const regionsList = parseListParam(regions);
                const sectorsList = parseListParam(sectors);
                const labelsList = parseListParam(labels);

                let dateRange: Record<string, string> | undefined;
                if (from_date && to_date) {
                    dateRange = {
                        from: from_date,
                        to: to_date,
                    };
                }

                const fields: Record<string, unknown> = {};
                if (regionsList) fields.regions = regionsList;
                if (sectorsList) fields.sectors = sectorsList;
                if (labelsList) fields.labels = labelsList;
                if (dateRange) fields.date_range = dateRange;

                const response = await apiManager.post(
                    `${KNOWLEDGEBASE_API_BASE}/news`,
                    {
                        pagination: {
                            page_number: page,
                            page_size: limit,
                        },
                        filters: { fields, mode: filter_mode },
                    }
                );
                const data = await response.json();

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(data, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving threat landscape news: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    // get_threat_actors_metadata
    server.registerTool(
        'get_threat_actors_metadata',
        {
            description: `Get all available filter options for most active threat actors search.

WHEN TO USE:
- ALWAYS call this BEFORE using get_most_active_threat_actors for first time
- User asks "what countries/sectors are available?"`,
        },
        async (extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );
                const response = await apiManager.post(
                    `${KNOWLEDGEBASE_API_BASE}/threat_actors/metadata`
                );
                const responseData = await response.json();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                responseData.data || {},
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving threat actors metadata: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    // get_most_active_threat_actors
    server.registerTool(
        'get_most_active_threat_actors',
        {
            description: `Retrieve most active threat actors with filtering by countries and sectors.

WHEN TO USE:
- User wants to know which threat actors target their country/sector
- Use get_threat_actors_metadata() FIRST to discover filter options`,
            inputSchema: {
                countries: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe('Countries to filter by.'),
                sectors: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe('Industry sectors to filter by.'),
                filter_mode: z
                    .string()
                    .default('or')
                    .describe('Logical operator for combining filters.'),
            },
        },
        async ({ countries, sectors, filter_mode = 'or' }, extra) => {
            try {
                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );

                const countriesList = parseListParam(countries) || [];
                const sectorsList = parseListParam(sectors) || [];

                const fields: Record<string, unknown> = {};
                if (countriesList.length > 0) fields.countries = countriesList;
                if (sectorsList.length > 0) fields.sectors = sectorsList;

                const response = await apiManager.post(
                    `${KNOWLEDGEBASE_API_BASE}/threat_actors/most_active`,
                    {
                        filters: {
                            fields,
                            mode: filter_mode,
                        },
                    }
                );
                const responseData = await response.json();

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                responseData.data || {},
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving most active threat actors: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    // get_threat_actor_by_id
    server.registerTool(
        'get_threat_actor_by_id',
        {
            description: `Retrieve comprehensive details for a specific threat actor by its ID.

WHEN TO USE:
- User mentions a specific threat actor ID
- Following up on threat actors found in search results`,
            inputSchema: {
                threat_actor_id: z
                    .string()
                    .describe('The unique threat actor ID in uuid4 format.'),
            },
        },
        async ({ threat_actor_id }, extra) => {
            try {
                if (!isValidUuid4(threat_actor_id)) {
                    throw new Error(
                        `Threat actor ID '${threat_actor_id}' is invalid, should be in uuid4 format.`
                    );
                }

                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );
                const response = await apiManager.post(
                    `${KNOWLEDGEBASE_API_BASE}/threat_actors/${threat_actor_id}`
                );
                const responseData = await response.json();

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                responseData.data || {},
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving threat actor details: ${msg}`,
                        },
                    ],
                };
            }
        }
    );

    // get_malware_by_id
    server.registerTool(
        'get_malware_by_id',
        {
            description: `Retrieve comprehensive details for a specific malware by its ID.

WHEN TO USE:
- User mentions a specific malware ID
- Following up on malware found in IOC enrichment results (related_entities field)

HOW TO FIND MALWARE ID:
Found in enrich_iocs response under result[].enrichment.related_entities[].entity_id
where entity_type == "Malware".`,
            inputSchema: {
                malware_id: z
                    .string()
                    .describe('The unique malware ID in uuid4 format.'),
            },
        },
        async ({ malware_id }, extra) => {
            try {
                if (!isValidUuid4(malware_id)) {
                    throw new Error(
                        `Malware ID '${malware_id}' is invalid, should be in uuid4 format.`
                    );
                }

                const apiManager = SessionContext.getAPIManager(
                    serverModule,
                    extra
                );
                const response = await apiManager.post(
                    `${KNOWLEDGEBASE_API_BASE}/malwares/${malware_id}`
                );
                const responseData = await response.json();

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                { data: responseData.data || {} },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error retrieving malware details: ${msg}`,
                        },
                    ],
                };
            }
        }
    );
}
