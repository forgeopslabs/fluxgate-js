import type { FlagEvaluation, JsonValue, ResolvedFlag } from './types';

/**
 * Turns an edge result into a typed {@link FlagEvaluation}. The type is taken
 * from the default value: a boolean default accepts only a boolean, a string
 * only a string, a number only a number, an object or array only an object or
 * array. A `null` default accepts any value.
 *
 * The edge answers a disabled or unassigned flag of any type with `false` and
 * no variant (the "off" marker). That yields the default with the edge's
 * reason, not a type mismatch.
 */
export function toEvaluation<T>(flag: ResolvedFlag, defaultValue: T): FlagEvaluation<T> {
  if (flag.errorCode) {
    return errorEvaluation(flag.key, defaultValue, flag.errorCode, flag.errorDetails, flag.metadata);
  }
  const base = { key: flag.key, reason: flag.reason, ...(flag.metadata ? { metadata: flag.metadata } : {}) };
  if (flag.value === undefined) {
    // The edge resolved to the code default.
    return { ...base, value: defaultValue, ...(flag.variant ? { variant: flag.variant } : {}) };
  }
  if (matchesType(flag.value, defaultValue)) {
    return { ...base, value: flag.value as T, ...(flag.variant ? { variant: flag.variant } : {}) };
  }
  if (flag.value === false && !flag.variant) {
    return { ...base, value: defaultValue };
  }
  return errorEvaluation(
    flag.key,
    defaultValue,
    'TYPE_MISMATCH',
    `Flag '${flag.key}' has a ${jsonType(flag.value)} value, expected ${jsonType(defaultValue as JsonValue)}`,
    flag.metadata,
  );
}

export function errorEvaluation<T>(
  key: string,
  defaultValue: T,
  errorCode: FlagEvaluation<T>['errorCode'],
  errorMessage?: string,
  metadata?: Record<string, JsonValue>,
): FlagEvaluation<T> {
  return {
    key,
    value: defaultValue,
    reason: 'ERROR',
    errorCode,
    ...(errorMessage ? { errorMessage } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function matchesType(value: JsonValue, defaultValue: unknown): boolean {
  if (defaultValue === null || defaultValue === undefined) {
    return true;
  }
  if (typeof defaultValue === 'object') {
    return value !== null && typeof value === 'object';
  }
  return typeof value === typeof defaultValue;
}

function jsonType(value: JsonValue | undefined): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}
