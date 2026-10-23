import { FluxGateError, errorCodeFromWire, errorFromResponse } from './errors';
import type { ResolvedOptions } from './options';
import type { BulkEvaluation, EvaluationContext, JsonValue, ResolvedFlag } from './types';

const FLAG_PATH = '/ofrep/v1/evaluate/flags/';
const BULK_PATH = '/ofrep/v1/evaluate/flags';
const HEALTH_PATH = '/health';

/**
 * HTTP transport for the edge's OFREP endpoints. Network errors, timeouts and
 * HTTP 502, 503 and 504 are retried with exponential backoff; everything else
 * fails at once.
 *
 * @internal Not part of the public API; may change between releases.
 */
export class OfrepTransport {
  constructor(private readonly options: ResolvedOptions) {}

  /** Evaluates one flag. */
  async evaluate(key: string, context: EvaluationContext): Promise<ResolvedFlag> {
    const body = requestBody(context);
    return this.withRetry(async () => {
      const response = await this.send(FLAG_PATH + encodeURIComponent(key), body);
      const json = await readJson(response);
      if (response.status !== 200) {
        throw errorFromResponse(response.status, field(json, 'errorCode'), field(json, 'errorDetails'));
      }
      return toResolvedFlag(json, key);
    });
  }

  /**
   * Evaluates every flag of the client's team.
   *
   * @param version the previous {@link BulkEvaluation.version}; the edge then
   *                answers `notModified` when nothing changed
   */
  async evaluateAll(context: EvaluationContext, version?: string): Promise<BulkEvaluation> {
    const body = requestBody(context);
    return this.withRetry(async () => {
      const response = await this.send(BULK_PATH, body, version);
      const etag = response.headers.get('etag') ?? undefined;
      if (response.status === 304) {
        return { notModified: true, version: etag ?? version, flags: {} };
      }
      const json = await readJson(response);
      if (response.status !== 200) {
        throw errorFromResponse(response.status, field(json, 'errorCode'), field(json, 'errorDetails'));
      }
      const list = field(json, 'flags');
      if (!Array.isArray(list)) {
        throw new FluxGateError('PARSE_ERROR', 'Malformed bulk evaluation from edge: missing flags array', 200);
      }
      const flags: Record<string, ResolvedFlag> = {};
      for (const item of list) {
        const flag = toResolvedFlag(item);
        flags[flag.key] = flag;
      }
      const metadataVersion = field(field(json, 'metadata'), 'version');
      return {
        notModified: false,
        version: etag ?? (typeof metadataVersion === 'string' ? metadataVersion : undefined),
        flags,
      };
    });
  }

  /** Probes `GET /health` once, without retries. */
  async health(): Promise<boolean> {
    try {
      const response = await this.request(HEALTH_PATH, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  private send(path: string, body: string, ifNoneMatch?: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.options.sdkKey}`,
    };
    if (ifNoneMatch) {
      headers['If-None-Match'] = ifNoneMatch;
    }
    return this.request(path, { method: 'POST', headers, body });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.options.fetch(this.options.baseUrl + path, { ...init, signal: controller.signal });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new FluxGateError(
        'GENERAL',
        timedOut
          ? `Edge did not answer within ${this.options.timeoutMs} ms`
          : `Could not reach the edge: ${describe(error)}`,
        undefined,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async withRetry<T>(call: () => Promise<T>): Promise<T> {
    let backoff = this.options.initialBackoffMs;
    for (let attempt = 1; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        const retryable = error instanceof FluxGateError && error.retryable;
        if (!retryable || attempt >= this.options.maxAttempts) {
          throw error;
        }
        await sleep(backoff);
        backoff *= 2;
      }
    }
  }
}

/** Builds the OFREP request body: the context with `targetingKey` first. */
function requestBody(context: EvaluationContext): string {
  const { targetingKey, ...attributes } = context;
  try {
    return JSON.stringify({ context: { targetingKey: targetingKey ?? '', ...attributes } });
  } catch (error) {
    throw new FluxGateError('INVALID_CONTEXT', `Evaluation context is not JSON-serializable: ${describe(error)}`);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    if (response.status === 200) {
      throw new FluxGateError('PARSE_ERROR', 'Malformed response from edge: not JSON', 200);
    }
    return undefined;
  }
}

function toResolvedFlag(node: unknown, requestedKey?: string): ResolvedFlag {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new FluxGateError('PARSE_ERROR', 'Malformed flag evaluation from edge: not an object', 200);
  }
  const object = node as Record<string, unknown>;
  const key = typeof object.key === 'string' ? object.key : requestedKey ?? '';
  const errorCode = object.errorCode == null ? undefined : errorCodeFromWire(object.errorCode, 'GENERAL');
  const reason = typeof object.reason === 'string' ? object.reason : errorCode ? 'ERROR' : 'UNKNOWN';
  const flag: ResolvedFlag = { key, reason };
  if (object.value !== undefined && object.value !== null) {
    flag.value = object.value as JsonValue;
  }
  if (typeof object.variant === 'string') {
    flag.variant = object.variant;
  }
  if (errorCode) {
    flag.errorCode = errorCode;
  }
  if (typeof object.errorDetails === 'string') {
    flag.errorDetails = object.errorDetails;
  }
  if (object.metadata && typeof object.metadata === 'object' && !Array.isArray(object.metadata)) {
    flag.metadata = object.metadata as Record<string, JsonValue>;
  }
  return flag;
}

function field(node: unknown, name: string): unknown {
  return node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[name] : undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
