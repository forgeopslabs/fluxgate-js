import {
  OpenFeatureEventEmitter,
  ProviderEvents,
  type EvaluationContext,
  type JsonValue,
  type Provider,
  type ResolutionDetails,
} from '@openfeature/web-sdk';
import { FluxGateClient } from '../client';
import type { FluxGateOptions } from '../options';
import type { FlagSnapshot } from '../snapshot';
import { toFluxGateContext, toResolution } from './shared';

export interface FluxGateWebProviderOptions {
  /** How often to re-fetch the flags, in milliseconds. `0` turns polling off. Default 30000. */
  pollIntervalMs?: number;
}

/**
 * OpenFeature provider for `@openfeature/web-sdk` (browsers). It loads every
 * flag for the static context in one OFREP bulk call, answers evaluations
 * synchronously from that set, and polls for changes, emitting
 * `ConfigurationChanged` with the changed flag keys.
 *
 * ```ts
 * await OpenFeature.setContext({ targetingKey: 'user-1', country: 'CA' });
 * await OpenFeature.setProviderAndWait(new FluxGateWebProvider({ baseUrl, sdkKey }));
 * ```
 */
export class FluxGateWebProvider implements Provider {
  readonly metadata = { name: 'FluxGate' } as const;
  readonly runsOn = 'client';
  readonly events = new OpenFeatureEventEmitter();

  private readonly client: FluxGateClient;
  private snapshot: FlagSnapshot | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(
    clientOrOptions: FluxGateClient | FluxGateOptions,
    private readonly options: FluxGateWebProviderOptions = {},
  ) {
    this.client = clientOrOptions instanceof FluxGateClient ? clientOrOptions : new FluxGateClient(clientOrOptions);
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    this.snapshot = this.client.watch(toFluxGateContext(context), { pollIntervalMs: this.options.pollIntervalMs });
    const snapshot = this.snapshot;
    this.unsubscribe = snapshot.subscribe((changed) => {
      if (snapshot.status === 'STALE') {
        this.events.emit(ProviderEvents.Stale, { message: snapshot.error?.message });
      } else if (snapshot.status === 'READY') {
        this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: changed });
      }
    });
    await snapshot.ready();
    if (snapshot.status === 'ERROR') {
      throw snapshot.error;
    }
  }

  async onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    await this.snapshot?.setContext(toFluxGateContext(newContext));
    if (this.snapshot?.status === 'ERROR') {
      throw this.snapshot.error;
    }
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.snapshot?.close();
    this.snapshot = undefined;
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    return this.resolve(flagKey, defaultValue);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    return this.resolve(flagKey, defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    return this.resolve(flagKey, defaultValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    return this.resolve(flagKey, defaultValue);
  }

  private resolve<T>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    if (!this.snapshot) {
      return toResolution({
        key: flagKey,
        value: defaultValue,
        reason: 'ERROR',
        errorCode: 'PROVIDER_NOT_READY',
        errorMessage: 'Provider is not initialized',
      });
    }
    return toResolution(this.snapshot.evaluate(flagKey, defaultValue));
  }
}
