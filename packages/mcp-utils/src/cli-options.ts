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
