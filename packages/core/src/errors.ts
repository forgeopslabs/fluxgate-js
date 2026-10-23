import type { ErrorCode } from './types';

/** A failed call to the edge. */
export class FluxGateError extends Error {
  override readonly name = 'FluxGateError';

  constructor(
    readonly errorCode: ErrorCode,
    message: string,
    /** HTTP status, or `undefined` for network errors and timeouts. */
    readonly status?: number,
    /** Whether retrying the same call can succeed. */
    readonly retryable = false,
  ) {
    super(message);
  }
}

const WIRE_CODES: readonly ErrorCode[] = [
  'FLAG_NOT_FOUND',
  'TYPE_MISMATCH',
  'TARGETING_KEY_MISSING',
  'INVALID_CONTEXT',
  'PROVIDER_NOT_READY',
  'PARSE_ERROR',
  'UNAUTHORIZED',
  'GENERAL',
];

/** Maps an OFREP `errorCode` string to an {@link ErrorCode}. */
export function errorCodeFromWire(wire: unknown, fallback: ErrorCode): ErrorCode {
  return typeof wire === 'string' && (WIRE_CODES as readonly string[]).includes(wire)
    ? (wire as ErrorCode)
    : fallback;
}

/** Maps an edge error response to a {@link FluxGateError}. */
export function errorFromResponse(status: number, wireCode: unknown, details: unknown): FluxGateError {
  const text = typeof details === 'string' && details.trim() !== '' ? `: ${details}` : '';
  const message = `Edge returned HTTP ${status}${text}`;
  let code: ErrorCode;
  switch (status) {
    case 400:
      code = errorCodeFromWire(wireCode, 'INVALID_CONTEXT');
      break;
    case 401:
    case 403:
      code = 'UNAUTHORIZED';
      break;
    case 404:
      code = 'FLAG_NOT_FOUND';
      break;
    case 503:
      code = 'PROVIDER_NOT_READY';
      break;
    default:
      code = 'GENERAL';
  }
  return new FluxGateError(code, message, status, status === 502 || status === 503 || status === 504);
}
