/**
 * Compute the Commander default for an environment-backed boolean option.
 *
 * Kept in a dependency-free module so packages that make process-level
 * decisions from the same environment variable can test against the
 * launcher's actual behaviour without loading the launcher and its transports.
 */
export function booleanOptionDefault(
  envValue: string | undefined,
  optionDefault: string | boolean | undefined
): boolean {
  return envValue === 'true' || optionDefault === 'true';
}

/**
 * The transport the launcher will use: the parsed --transport option (whose
 * Commander default is MCP_TRANSPORT_TYPE), then MCP_TRANSPORT_TYPE, then stdio.
 */
export function resolveTransportType(
  transportOption: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): 'stdio' | 'http' {
  return (transportOption || env.MCP_TRANSPORT_TYPE || 'stdio').toLowerCase() === 'http' ? 'http' : 'stdio';
}

/**
 * Derive the key commander uses in `opts()` from a configured flag string.
 * `'--write-mode'` -> `'writeMode'`, `'--client-id <id>'` -> `'clientId'`.
 *
 * `negated` reports whether the flag is one of commander's negatable `--no-*`
 * forms. Commander strips that prefix and keys the option under the remaining
 * name — `'--no-verify-tls'` becomes `verifyTls`, defaulting to true and set to
 * false when the flag is passed — so the prefix has to be stripped here too or
 * the derived key would never match anything in `opts()`.
 */
export function optionKey(flag: string): { key: string; negated: boolean } | undefined {
  const long = flag.split(/[,\s]+/).find(part => part.startsWith('--'));
  if (!long) return undefined;
  const negated = long.startsWith('--no-');
  return {
    key: long
      .replace(/^--(no-)?/, '')
      .replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase()),
    negated,
  };
}

/**
 * The operator's values, keyed by environment-variable name: the process
 * environment, overlaid with every declared option's parsed value (so a value
 * given as a CLI flag counts the same as its environment variable).
 */
export function operatorValues(
  options: readonly { flag: string; env?: string }[],
  parsed: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  const values: Record<string, unknown> = { ...env };
  for (const option of options) {
    const derived = option.env ? optionKey(option.flag) : undefined;
    if (!derived || derived.negated) continue;
    const value = parsed[derived.key];
    if (value !== undefined) values[option.env!] = value;
  }
  return values;
}
