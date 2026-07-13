/**
 * Fetch the MCP OpenAPI spec from SwaggerHub or a local path.
 *
 * Usage:
 *   tsx scripts/fetch-spec.ts                          # fetch from SwaggerHub
 *   LOCAL_SPEC_PATH=../genaiprotect-core/openapi-mcp.json tsx scripts/fetch-spec.ts  # local
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const SWAGGERHUB_API = 'https://api.swaggerhub.com/apis';
const SWAGGERHUB_ORG = 'Check-Point';
const SWAGGERHUB_API_NAME = 'workforce-ai-mcp';
const OUTPUT_PATH = resolve(import.meta.dirname, '..', 'specs', 'openapi-mcp.json');

function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = apiKey;
  }
  return headers;
}

async function main() {
  const localPath = process.env.LOCAL_SPEC_PATH;

  if (localPath) {
    console.log(`Copying local spec from ${localPath}`);
    const localSpec = JSON.parse(readFileSync(resolve(localPath), 'utf-8'));
    writeFileSync(OUTPUT_PATH, JSON.stringify(localSpec, null, 2) + '\n', 'utf-8');
  } else {
    const apiKey = process.env.SWAGGERHUB_API_KEY;
    const headers = buildHeaders(apiKey);

    // First, fetch the API listing to get the latest version
    const listingUrl = `${SWAGGERHUB_API}/${SWAGGERHUB_ORG}/${SWAGGERHUB_API_NAME}`;
    const listingResponse = await fetch(listingUrl, { headers });
    if (!listingResponse.ok) {
      throw new Error(`Failed to fetch API listing: ${listingResponse.status} ${listingResponse.statusText}`);
    }
    const listing = await listingResponse.json() as { defaultVersion: string };
    const version = listing.defaultVersion;
    console.log(`Latest version: ${version}`);

    // Then fetch the actual spec
    const url = `${listingUrl}/${version}`;
    console.log(`Fetching spec from ${url}`);

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }

    const spec = await response.json();
    writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
  }

  const spec = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
  const pathCount = Object.keys(spec.paths || {}).length;
  console.log(`Spec saved to ${OUTPUT_PATH} (${pathCount} paths)`);
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
