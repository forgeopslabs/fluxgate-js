import { EvaluationCache } from './cache';
import { errorEvaluation, toEvaluation } from './convert';
import { FluxGateError } from './errors';
import { resolveOptions, type FluxGateOptions, type ResolvedOptions } from './options';
import { FlagSnapshot, type SnapshotOptions } from './snapshot';
import { OfrepTransport } from './transport';
import type { BulkEvaluation, EvaluationContext, FlagEvaluation, JsonValue } from './types';

/**
 * Evaluates FluxGate flags against an edge server over OFREP.
 *
 * ```ts
 * const fluxgate = new FluxGateClient({ baseUrl: 'https://edge.example.com', sdkKey: process.env.FLUXGATE_SDK_KEY! });
 * const enabled = await fluxgate.isEnabled('new-checkout', { targetingKey: 'user-1', country: 'CA' });
 * ```
 *
 * Evaluations never throw: on any error they return the default value with an
 * `errorCode`. Single-flag results are cached briefly per flag and context.
 * For UIs, {@link watch} keeps every flag for one context in memory.
 */
export class FluxGateClient {
  private readonly options: ResolvedOptions;
  private readonly transport: OfrepTransport;
  private readonly cache: EvaluationCache;

  constructor(options: FluxGateOptions) {
    this.options = resolveOptions(options);
    this.transport = new OfrepTransport(this.options);
    this.cache = new EvaluationCache(this.options.cacheTtlMs, this.options.cacheMaxSize);
  }

  /**
   * Evaluates one flag. The default value is returned on any error, and its
   * type is the expected type of the flag (`null` accepts any value). A
   * string, number or boolean default gives `string`, `number` or `boolean`,
   * not the default's literal type; pass a type argument for a union of
   * variants.
   */
  evaluate(key: string, defaultValue: string, context?: EvaluationContext): Promise<FlagEvaluation<string>>;
  evaluate(key: string, defaultValue: number, context?: EvaluationContext): Promise<FlagEvaluation<number>>;
  evaluate(key: string, defaultValue: boolean, context?: EvaluationContext): Promise<FlagEvaluation<boolean>>;
  evaluate<T extends JsonValue>(key: string, defaultValue: T, context?: EvaluationContext): Promise<FlagEvaluation<T>>;
  async evaluate<T extends JsonValue>(
    key: string,
    defaultValue: T,
    context: EvaluationContext = {},
  ): Promise<FlagEvaluation<T>> {
    if (!key) {
      return errorEvaluation(key, defaultValue, 'GENERAL', 'Flag key must not be empty');
    }
    if (!context.targetingKey) {
      // The edge rejects an empty targeting key; save the round trip.
      return errorEvaluation(key, defaultValue, 'TARGETING_KEY_MISSING', 'Evaluation context has no targetingKey');
    }
    try {
      let flag = this.options.cacheEnabled ? this.cache.get(key, context) : undefined;
      if (!flag) {
        flag = await this.transport.evaluate(key, context);
        if (this.options.cacheEnabled && !flag.errorCode) {
          this.cache.set(key, context, flag);
        }
      }
      return toEvaluation(flag, defaultValue);
    } catch (error) {
      const failure = error instanceof FluxGateError ? error : new FluxGateError('GENERAL', String(error));
      return errorEvaluation(key, defaultValue, failure.errorCode, failure.message);
    }
  }

  async getBoolean(key: string, defaultValue: boolean, context?: EvaluationContext): Promise<boolean> {
    return (await this.evaluate(key, defaultValue, context)).value;
  }

  async getString(key: string, defaultValue: string, context?: EvaluationContext): Promise<string> {
    return (await this.evaluate(key, defaultValue, context)).value;
  }

  async getNumber(key: string, defaultValue: number, context?: EvaluationContext): Promise<number> {
    return (await this.evaluate(key, defaultValue, context)).value;
  }

  async getObject<T extends JsonValue>(key: string, defaultValue: T, context?: EvaluationContext): Promise<T> {
    return (await this.evaluate(key, defaultValue, context)).value;
  }

  /** `true` only when the flag evaluates to the boolean `true`. */
  isEnabled(key: string, context?: EvaluationContext): Promise<boolean> {
    return this.getBoolean(key, false, context);
  }

  /**
   * Evaluates every flag of the client's team in one request. Pass the
   * previous result's `version` to get `notModified` when nothing changed.
   * Unlike {@link evaluate}, this throws a {@link FluxGateError} on failure.
   */
  evaluateAll(context: EvaluationContext, version?: string): Promise<BulkEvaluation> {
    return this.transport.evaluateAll(context, version);
  }

  /**
   * Loads every flag for `context` and keeps them current by polling. Use the
   * returned snapshot for synchronous evaluations, for example in a UI.
   */
  watch(context: EvaluationContext, options?: SnapshotOptions): FlagSnapshot {
    return new FlagSnapshot(this.transport, context, options);
  }

  /** `true` when the edge answers `GET /health` with 2xx. */
  isHealthy(): Promise<boolean> {
    return this.transport.health();
  }

  /** Drops cached single-flag evaluations. */
  clearCache(): void {
    this.cache.clear();
  }
}
