// Utility for string checks
export function nullOrEmpty(val?: string): boolean {
  return (
    val === undefined ||
    val === null ||
    (typeof val === 'string' && (val.trim() === '' || val === 'undefined' || val === 'null'))
  );
}

/**
 * Validates if a string is a valid IPv4 or IPv6 address
 */
export function isValidIp(ip: string): boolean {
  // IPv4 regex pattern
  const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex pattern (simplified)
  const ipv6Pattern = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

/**
 * Validates if a string is a valid file hash (MD5, SHA-1, SHA-256)
 */
export function isValidFileHash(hash: string): boolean {
  // MD5: 32 hex characters
  const md5Pattern = /^[a-fA-F0-9]{32}$/;

  // SHA-1: 40 hex characters
  const sha1Pattern = /^[a-fA-F0-9]{40}$/;

  // SHA-256: 64 hex characters
  const sha256Pattern = /^[a-fA-F0-9]{64}$/;

  return md5Pattern.test(hash) || sha1Pattern.test(hash) || sha256Pattern.test(hash);
}

export function getReputationVerdict(risk: number, confidence: string): string {
  if (risk === 0 && (confidence === 'High')) {
    return 'Classified as clean';
  } else if (risk >= 80) {
    return 'Classified as malicious';
  } else {
    return 'Not classified as malicious';
  }
}
