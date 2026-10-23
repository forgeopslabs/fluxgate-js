/** Settings for {@link FluxGateClient}. Only `baseUrl` and `sdkKey` are required. */
export interface FluxGateOptions {
  /** Edge server URL, for example `https://edge.example.com`. */
  baseUrl: string;
  /** SDK key of a FluxGate client, `<clientId>.<apiKey>`. Use a Web client in browsers. */
  sdkKey: string;
  /** Timeout for one edge request, in milliseconds. Default 5000. */
  timeoutMs?: number;
  retry?: {
    /** Attempts per call, counting the first. Default 3. */
    maxAttempts?: number;
    /** Pause before the first retry, doubled on each retry. Default 100 ms. */
    initialBackoffMs?: number;
  };
  cache?: {
    /** Cache successful single-flag evaluations. Default `true`. */
    enabled?: boolean;
    /** How long a cached evaluation is reused. Default 30000 ms. */
    ttlMs?: number;
    /** Maximum number of cached evaluations. Default 1000. */
    maxSize?: number;
  };
  /** `fetch` implementation to use. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** {@link FluxGateOptions} with every default filled in. */
export interface ResolvedOptions {
  baseUrl: string;
  sdkKey: string;
  timeoutMs: number;
  maxAttempts: number;
  initialBackoffMs: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  cacheMaxSize: number;
  fetch: typeof fetch;
}

/** Validates options and fills in defaults. Never includes the SDK key in an error. */
export function resolveOptions(options: FluxGateOptions): ResolvedOptions {
  if (!options || typeof options.baseUrl !== 'string' || options.baseUrl.trim() === '') {
    throw new TypeError('FluxGate: baseUrl must be set to the edge server URL');
  }
  if (!/^https?:\/\//.test(options.baseUrl)) {
    throw new TypeError('FluxGate: baseUrl must be an http:// or https:// URL');
  }
  const key = options.sdkKey;
  const dot = typeof key === 'string' ? key.indexOf('.') : -1;
  if (typeof key !== 'string' || dot <= 0 || dot === key.length - 1) {
    throw new TypeError('FluxGate: sdkKey must have the form <clientId>.<apiKey>');
  }
  const fetchImpl = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  if (!fetchImpl) {
    throw new TypeError('FluxGate: no global fetch; pass options.fetch');
  }
  return {
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    sdkKey: key,
    timeoutMs: positive(options.timeoutMs, 5000),
    maxAttempts: Math.max(1, Math.floor(options.retry?.maxAttempts ?? 3)),
    initialBackoffMs: Math.max(0, options.retry?.initialBackoffMs ?? 100),
    cacheEnabled: options.cache?.enabled ?? true,
    cacheTtlMs: positive(options.cache?.ttlMs, 30_000),
    cacheMaxSize: Math.max(1, Math.floor(options.cache?.maxSize ?? 1000)),
    fetch: fetchImpl,
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback;
}
