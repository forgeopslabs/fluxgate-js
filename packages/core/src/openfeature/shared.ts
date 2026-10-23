import { ErrorCode as OpenFeatureErrorCode, type FlagMetadata, type ResolutionDetails } from '@openfeature/core';
import type { ErrorCode, EvaluationContext, FlagEvaluation, JsonValue } from '../types';

/** Turns a FluxGate evaluation into OpenFeature resolution details. */
export function toResolution<T>(evaluation: FlagEvaluation<T>): ResolutionDetails<T> {
  const details: ResolutionDetails<T> = {
    value: evaluation.value,
    reason: evaluation.reason,
  };
  if (evaluation.variant) {
    details.variant = evaluation.variant;
  }
  if (evaluation.errorCode) {
    details.errorCode = toOpenFeatureErrorCode(evaluation.errorCode);
    details.errorMessage = evaluation.errorMessage;
  }
  const metadata = toFlagMetadata(evaluation.metadata);
  if (metadata) {
    details.flagMetadata = metadata;
  }
  return details;
}

/** Turns an OpenFeature evaluation context into a FluxGate one. */
export function toFluxGateContext(context: Record<string, unknown> | undefined): EvaluationContext {
  const result: EvaluationContext = {};
  for (const [name, value] of Object.entries(context ?? {})) {
    if (value !== undefined) {
      result[name] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return result;
}

function toOpenFeatureErrorCode(code: ErrorCode): OpenFeatureErrorCode {
  switch (code) {
    case 'FLAG_NOT_FOUND':
      return OpenFeatureErrorCode.FLAG_NOT_FOUND;
    case 'TYPE_MISMATCH':
      return OpenFeatureErrorCode.TYPE_MISMATCH;
    case 'TARGETING_KEY_MISSING':
      return OpenFeatureErrorCode.TARGETING_KEY_MISSING;
    case 'INVALID_CONTEXT':
      return OpenFeatureErrorCode.INVALID_CONTEXT;
    case 'PROVIDER_NOT_READY':
      return OpenFeatureErrorCode.PROVIDER_NOT_READY;
    case 'PARSE_ERROR':
      return OpenFeatureErrorCode.PARSE_ERROR;
    default:
      return OpenFeatureErrorCode.GENERAL;
  }
}

/** OpenFeature flag metadata allows only strings, numbers and booleans. */
function toFlagMetadata(metadata: Record<string, JsonValue> | undefined): FlagMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(metadata)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[name] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
