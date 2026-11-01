import type { IncomingMessage, ServerResponse } from 'http';

export const DEFAULT_MAX_HTTP_BODY_BYTES = 4 * 1024 * 1024;
const MAX_DRAIN_BYTES = 32 * 1024 * 1024;
const DRAIN_TIMEOUT_MS = 1000;

export function maxHttpBodyBytes(value = process.env.MCP_MAX_HTTP_BODY_BYTES): number {
  if (value === undefined || value === '') return DEFAULT_MAX_HTTP_BODY_BYTES;
  const bytes = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error('MCP_MAX_HTTP_BODY_BYTES must be a positive safe integer');
  }
  return bytes;
}

/** Discard a bounded amount so a finite uploader can finish before we close. */
function drainRejectedBody(req: IncomingMessage, maxBytes: number): Promise<void> {
  if (req.readableEnded || req.destroyed) return Promise.resolve();
  return new Promise(resolve => {
    let discarded = 0;
    const finish = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', finish);
      req.off('error', finish);
      req.off('close', finish);
      req.pause();
      resolve();
    };
    const onData = (chunk: Buffer) => {
      discarded += chunk.length;
      if (discarded >= Math.min(4 * maxBytes, MAX_DRAIN_BYTES)) finish();
    };
    const timer = setTimeout(finish, DRAIN_TIMEOUT_MS);
    req.on('data', onData);
    req.once('end', finish);
    req.once('error', finish);
    req.once('close', finish);
    req.resume();
  });
}

/** Returns null after sending 413. Counts streamed bytes, including chunked requests. */
export async function readHttpBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number
): Promise<Buffer | null> {
  const reject = async () => {
    // Send the status promptly, but delay closing until a bounded drain finishes.
    // Closing with a large upload still in flight can turn the 413 into EPIPE.
    res.shouldKeepAlive = false;
    res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
    res.write(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: `Request body exceeds ${maxBytes} bytes` },
      id: null,
    }));
    await drainRejectedBody(req, maxBytes);
    res.end();
    return null;
  };

  const declaredLength = req.headers['content-length'];
  if (declaredLength !== undefined && Number(declaredLength) > maxBytes) return reject();

  const chunks: Buffer[] = [];
  let size = 0;
  let oversized = false;
  // destroyOnReturn:false lets the 413 response flush when we stop reading early.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      oversized = true;
      break;
    }
    chunks.push(buffer);
  }
  if (oversized) {
    chunks.length = 0;
    return reject();
  }
  return Buffer.concat(chunks, size);
}
