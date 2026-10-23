import { computed, DestroyRef, inject, Injectable, signal, type Signal } from '@angular/core';
import {
  FluxGateClient,
  type EvaluationContext,
  type FlagEvaluation,
  type FlagSnapshot,
  type FluxGateError,
  type SnapshotStatus,
} from '@forgeops/fluxgate';
import { FLUXGATE_CONFIG } from './config';

/**
 * Holds every flag for the current context and exposes them as signals.
 * Provided by {@link provideFluxGate}.
 *
 * ```ts
 * readonly theme = inject(FluxGateService).flag('checkout-theme', 'classic');
 * ```
 */
@Injectable()
export class FluxGateService {
  /** The underlying client, for on-demand evaluations. */
  readonly client: FluxGateClient;

  private readonly snapshot: FlagSnapshot;
  private readonly revision = signal(0);

  /** Load status: `NOT_READY`, `READY`, `STALE` or `ERROR`. */
  readonly status: Signal<SnapshotStatus> = computed(() => {
    this.revision();
    return this.snapshot.status;
  });

  /** `true` once the flags are loaded (`READY` or `STALE`). */
  readonly ready: Signal<boolean> = computed(() => this.status() === 'READY' || this.status() === 'STALE');

  /** The error of the last failed load, if the last load failed. */
  readonly error: Signal<FluxGateError | undefined> = computed(() => {
    this.revision();
    return this.snapshot.error;
  });

  constructor() {
    const config = inject(FLUXGATE_CONFIG);
    if (!config.client && !config.options) {
      throw new Error('provideFluxGate needs either options or client');
    }
    this.client = config.client ?? new FluxGateClient(config.options!);
    this.snapshot = this.client.watch(config.context, { pollIntervalMs: config.pollIntervalMs });
    const unsubscribe = this.snapshot.subscribe(() => this.revision.update((value) => value + 1));
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      this.snapshot.close();
    });
  }

  /**
   * A flag's value as a signal. The default is returned while the flags load
   * and on any error, and its type is the expected type of the flag.
   */
  flag<T>(key: string, defaultValue: T): Signal<T> {
    return computed(() => this.value(key, defaultValue));
  }

  /** A flag's full evaluation (value, variant, reason, error) as a signal. */
  details<T>(key: string, defaultValue: T): Signal<FlagEvaluation<T>> {
    return computed(() => this.evaluate(key, defaultValue));
  }

  /** A boolean flag as a signal; `true` only when it is on. */
  isEnabled(key: string): Signal<boolean> {
    return this.flag(key, false);
  }

  /** A flag's current value. Reactive when read in a template, `computed` or `effect`. */
  value<T>(key: string, defaultValue: T): T {
    return this.evaluate(key, defaultValue).value;
  }

  /** A flag's current evaluation. Reactive when read in a template, `computed` or `effect`. */
  evaluate<T>(key: string, defaultValue: T): FlagEvaluation<T> {
    this.revision();
    return this.snapshot.evaluate(key, defaultValue);
  }

  /** Switches to another context, for example after sign-in, and loads its flags. */
  setContext(context: EvaluationContext): Promise<void> {
    return this.snapshot.setContext(context);
  }

  /** Resolves once the current load has finished, successfully or not. */
  whenReady(): Promise<void> {
    return this.snapshot.ready();
  }

  /** Fetches the flags now instead of waiting for the next poll. */
  refresh(): Promise<void> {
    return this.snapshot.refresh();
  }
}
