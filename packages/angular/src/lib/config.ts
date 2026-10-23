import { InjectionToken } from '@angular/core';
import type { EvaluationContext, FluxGateClient, FluxGateOptions } from '@forgeops/fluxgate';

/** Settings for {@link provideFluxGate}. Pass either `options` or `client`. */
export interface FluxGateConfig {
  /** Settings for a client the service creates. Use a Web client's SDK key. */
  options?: FluxGateOptions;
  /** An existing client, for example one shared with non-Angular code. */
  client?: FluxGateClient;
  /** Who the flags are evaluated for at startup. Must include `targetingKey`. */
  context: EvaluationContext;
  /** How often to re-fetch the flags, in milliseconds. `0` turns polling off. Default 30000. */
  pollIntervalMs?: number;
  /**
   * Delay application start until the first load finishes (successfully or
   * not), so templates never show default values first. Default `true`.
   */
  waitForReady?: boolean;
}

export const FLUXGATE_CONFIG = new InjectionToken<FluxGateConfig>('FLUXGATE_CONFIG');
