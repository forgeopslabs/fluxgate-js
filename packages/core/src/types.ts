/** A JSON value, as flags can hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Who a flag is evaluated for. `targetingKey` identifies the user (or other
 * subject) and decides their bucket in percentage splits; the edge requires it.
 * Every other property is a targeting attribute, such as `country` or
 * `user_tier`. `Date` values are sent as ISO-8601 strings.
 */
export interface EvaluationContext {
  targetingKey?: string;
  [attribute: string]: unknown;
}

/** Why an evaluation failed. Matches OpenFeature's error codes where they overlap. */
export type ErrorCode =
  | 'FLAG_NOT_FOUND'
  | 'TYPE_MISMATCH'
  | 'TARGETING_KEY_MISSING'
  | 'INVALID_CONTEXT'
  | 'PROVIDER_NOT_READY'
  | 'PARSE_ERROR'
  | 'UNAUTHORIZED'
  | 'GENERAL';

/** The outcome of one flag evaluation. On error, `value` is the default you passed. */
export interface FlagEvaluation<T> {
  key: string;
  value: T;
  /** The variant the edge served, if the flag has variants. */
  variant?: string;
  /** The edge's reason, for example `TARGETING_MATCH`, `SPLIT`, `DISABLED` or `ERROR`. */
  reason: string;
  errorCode?: ErrorCode;
  errorMessage?: string;
  metadata?: Record<string, JsonValue>;
}

/** One flag as the edge resolved it, before it is converted to the caller's type. */
export interface ResolvedFlag {
  key: string;
  /** `undefined` when the edge answered with the code default. */
  value?: JsonValue;
  variant?: string;
  reason: string;
  errorCode?: ErrorCode;
  errorDetails?: string;
  metadata?: Record<string, JsonValue>;
}

/** The result of a bulk evaluation. */
export interface BulkEvaluation {
  /** `true` when the flags have not changed since the version passed in. */
  notModified: boolean;
  /** Version of the flag set (the edge's `ETag`), to pass back next time. */
  version?: string;
  /** Flags by key; empty when `notModified`. */
  flags: Record<string, ResolvedFlag>;
}
