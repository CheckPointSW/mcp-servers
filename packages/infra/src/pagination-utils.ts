/**
 * Formats an API response as a pretty-printed JSON string with a pagination
 * hint header line when the response includes from/to/total fields.
 *
 * For responses without a `total` field the output is identical to
 * JSON.stringify(resp, null, 2).
 */
export function formatWithPaginationHint(resp: any): string {
  const total = resp.total;
  if (total === undefined) return JSON.stringify(resp, null, 2);
  const from = resp.from ?? 1;
  const to = resp.to ?? total;
  const nextPageNote = to < total ? ` | Next page: use offset: ${to}` : '';
  return `// ${from}–${to} of ${total} total${nextPageNote}\n` + JSON.stringify(resp, null, 2);
}
