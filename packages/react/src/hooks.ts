import type { FlagEvaluation, FluxGateClient, FluxGateError, SnapshotStatus } from '@forgeops/fluxgate';
import { useCallback, useSyncExternalStore } from 'react';
import { useFluxGateContext } from './provider';

/** Re-renders the component whenever the provider's flags or status change. */
function useRevision(): number {
  const { snapshot } = useFluxGateContext();
  const subscribe = useCallback((onChange: () => void) => snapshot.subscribe(onChange), [snapshot]);
  const revision = useCallback(() => snapshot.revision, [snapshot]);
  return useSyncExternalStore(subscribe, revision, revision);
}

/**
 * The value of a flag. The default is returned while the flags load and on
 * any error, and its type is the expected type of the flag.
 *
 * ```tsx
 * const theme = useFlag('checkout-theme', 'classic');
 * ```
 */
export function useFlag<T>(key: string, defaultValue: T): T {
  return useFlagDetails(key, defaultValue).value;
}

/** The full evaluation of a flag: value, variant, reason and any error. */
export function useFlagDetails<T>(key: string, defaultValue: T): FlagEvaluation<T> {
  const { snapshot } = useFluxGateContext();
  useRevision();
  return snapshot.evaluate(key, defaultValue);
}

/** `true` only when a boolean flag is on. */
export function useIsEnabled(key: string): boolean {
  return useFlag(key, false);
}

export interface FluxGateStatus {
  status: SnapshotStatus;
  /** `true` once the flags are loaded (`READY` or `STALE`). */
  ready: boolean;
  error?: FluxGateError;
}

/** Load status of the provider's flags, for loading or error UI. */
export function useFluxGateStatus(): FluxGateStatus {
  const { snapshot } = useFluxGateContext();
  useRevision();
  const status = snapshot.status;
  return {
    status,
    ready: status === 'READY' || status === 'STALE',
    ...(snapshot.error ? { error: snapshot.error } : {}),
  };
}

/** The provider's {@link FluxGateClient}, for on-demand evaluations. */
export function useFluxGateClient(): FluxGateClient {
  return useFluxGateContext().client;
}
