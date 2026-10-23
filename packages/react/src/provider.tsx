import {
  FluxGateClient,
  type EvaluationContext,
  type FlagSnapshot,
  type FluxGateOptions,
} from '@forgeops/fluxgate';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface FluxGateContextValue {
  client: FluxGateClient;
  snapshot: FlagSnapshot;
}

const FluxGateReactContext = createContext<FluxGateContextValue | null>(null);

export type FluxGateProviderProps = {
  /** Who the flags are evaluated for. Must include `targetingKey`. */
  context: EvaluationContext;
  /** How often to re-fetch the flags, in milliseconds. `0` turns polling off. Default 30000. */
  pollIntervalMs?: number;
  children?: ReactNode;
} & (
  | {
      /** An existing client, for example one shared with non-React code. */
      client: FluxGateClient;
      options?: never;
    }
  | {
      /** Settings for a client the provider creates. Use a Web client's SDK key. */
      options: FluxGateOptions;
      client?: never;
    }
);

/**
 * Loads every flag for `context` and makes them available to the hooks below
 * it. When `context` changes (compared by value), the flags are reloaded.
 * The client is created once; later changes to `options` or `client` are ignored.
 *
 * ```tsx
 * <FluxGateProvider options={{ baseUrl, sdkKey }} context={{ targetingKey: user.id, country: user.country }}>
 *   <App />
 * </FluxGateProvider>
 * ```
 */
export function FluxGateProvider(props: FluxGateProviderProps): ReactNode {
  const { context, pollIntervalMs, children } = props;
  const [client] = useState(() => props.client ?? new FluxGateClient(props.options!));
  const contextKey = JSON.stringify(context);
  const latest = useRef({ context, contextKey, pollIntervalMs });
  latest.current = { context, contextKey, pollIntervalMs };
  const [snapshot, setSnapshot] = useState(() => client.watch(context, { pollIntervalMs }));
  const loadedContextKey = useRef(contextKey);

  useEffect(() => {
    if (snapshot.isClosed) {
      // React StrictMode unmounts and remounts once; start a fresh snapshot.
      loadedContextKey.current = latest.current.contextKey;
      setSnapshot(client.watch(latest.current.context, { pollIntervalMs: latest.current.pollIntervalMs }));
      return undefined;
    }
    return () => snapshot.close();
  }, [client, snapshot]);

  useEffect(() => {
    if (loadedContextKey.current !== contextKey && !snapshot.isClosed) {
      loadedContextKey.current = contextKey;
      void snapshot.setContext(latest.current.context);
    }
  }, [contextKey, snapshot]);

  const value = useMemo(() => ({ client, snapshot }), [client, snapshot]);
  return <FluxGateReactContext.Provider value={value}>{children}</FluxGateReactContext.Provider>;
}

/** The provider's client and snapshot. Throws outside a {@link FluxGateProvider}. */
export function useFluxGateContext(): FluxGateContextValue {
  const value = useContext(FluxGateReactContext);
  if (!value) {
    throw new Error('FluxGate hooks must be used inside <FluxGateProvider>');
  }
  return value;
}
