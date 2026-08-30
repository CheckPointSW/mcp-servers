/**
 * Small concurrency and timing helpers used by the API manager.
 * Kept separate so the client file stays about SmartAPI semantics.
 */

/** Bounded concurrency, standing in for a real upstream rate limit. */
export class Semaphore {
    private active = 0;
    private readonly waiting: (() => void)[] = [];

    constructor(private readonly limit: number) {}

    async acquire(): Promise<() => void> {
        if (this.active >= this.limit) {
            await new Promise<void>((resolve) => this.waiting.push(resolve));
        }
        this.active += 1;

        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.active -= 1;
            this.waiting.shift()?.();
        };
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A fully-read HTTP response.
 *
 * fetch bodies can only be consumed once, and both the success path (JSON or
 * raw bytes) and the error path (a short text detail) need them, so the body
 * is read eagerly and decoded on demand.
 */
export class RawResponse {
    private decoded: string | undefined;

    constructor(
        readonly status: number,
        readonly headers: Headers,
        readonly bytes: Uint8Array
    ) {}

    static async from(response: Response): Promise<RawResponse> {
        const buffer = await response.arrayBuffer();
        return new RawResponse(
            response.status,
            response.headers,
            new Uint8Array(buffer)
        );
    }

    text(): string {
        this.decoded ??= new TextDecoder().decode(this.bytes);
        return this.decoded;
    }

    json(): unknown {
        const body = this.text();
        if (!body.trim()) return null;
        return JSON.parse(body);
    }
}
