#!/usr/bin/env node

console.error(
    '\n' +
    '@chkp/cloudguard-waf-mcp has been renamed to @chkp/checkpoint-waf-mcp.\n' +
    'Update your MCP client config to use the new package name (bin: checkpoint-waf-mcp).\n' +
    'This package is a tombstone and will no longer receive updates.\n'
);

// Exit 0 (rather than an error code) so CI/npx smoke checks that run `--help`
// against every bin still pass; the deprecation notice above is the point.
process.exit(0);
