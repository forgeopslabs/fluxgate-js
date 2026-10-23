import type { FluxGateOptions } from '../src';

export const SDK_KEY = 'client-1.api-key-1';
export const BASE_URL = 'http://edge.test';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;
type Handler = (request: RecordedRequest) => Reply;

/** A fake edge server: a `fetch` that answers from per-path handlers and records every request. */
export class FakeEdge {
  readonly requests: RecordedRequest[] = [];
  private readonly handlers = new Map<string, Handler[]>();

  /** Queues replies for a path; the last one repeats. */
  on(path: string, ...replies: (Reply | Handler)[]): this {
    this.handlers.set(
      path,
      replies.map((reply) => (typeof reply === 'function' ? reply : () => reply)),
    );
    return this;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = url.slice(BASE_URL.length);
    const request: RecordedRequest = {
      url,
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    this.requests.push(request);
    const queue = this.handlers.get(path);
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ errorCode: 'FLAG_NOT_FOUND' }), { status: 404 });
    }
    const handler = queue.length > 1 ? queue.shift()! : queue[0]!;
    const reply = handler(request);
    if (reply instanceof Error) {
      throw reply;
    }
    const body = reply.body === undefined ? null : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
    return new Response(reply.status === 304 ? null : body, { status: reply.status, headers: reply.headers });
  };

  options(extra: Partial<FluxGateOptions> = {}): FluxGateOptions {
    return {
      baseUrl: BASE_URL,
      sdkKey: SDK_KEY,
      fetch: this.fetch,
      retry: { maxAttempts: 3, initialBackoffMs: 0 },
      ...extra,
    };
  }

  count(path: string): number {
    return this.requests.filter((request) => request.url === BASE_URL + path).length;
  }
}

export const flag = (key: string) => `/ofrep/v1/evaluate/flags/${key}`;
export const BULK = '/ofrep/v1/evaluate/flags';
