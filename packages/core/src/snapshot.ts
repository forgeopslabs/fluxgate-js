import { toEvaluation, errorEvaluation } from './convert';
import { FluxGateError } from './errors';
import type { OfrepTransport } from './transport';
import type { EvaluationContext, FlagEvaluation, ResolvedFlag } from './types';

/**
 * - `NOT_READY`: the first load has not finished.
 * - `READY`: the flags are current.
 * - `STALE`: a refresh failed; the last loaded flags are still served.
 * - `ERROR`: the first load failed; evaluations return defaults.
 */
export type SnapshotStatus = 'NOT_READY' | 'READY' | 'STALE' | 'ERROR';

/** Called after the flags or the status change, with the keys whose result changed. */
export type SnapshotListener = (changedKeys: string[]) => void;

export interface SnapshotOptions {
  /** How often to re-fetch the flags, in milliseconds. `0` turns polling off. Default 30000. */
  pollIntervalMs?: number;
}

/**
 * Every flag of the client's team, evaluated for one context and kept up to
 * date by polling. Evaluations against it are synchronous, which suits UI
 * frameworks. Create one with {@link FluxGateClient.watch}.
 *
 * Polling sends the last version in `If-None-Match`, so an unchanged flag set
 * costs a `304` with no body.
 */
export class FlagSnapshot {
  private flags: Record<string, ResolvedFlag> = {};
  private flagVersion: string | undefined;
  private currentContext: EvaluationContext;
  private currentStatus: SnapshotStatus = 'NOT_READY';
  private lastError: FluxGateError | undefined;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private changes = 0;
  private closed = false;
  private firstLoad: Promise<void>;

  constructor(
    private readonly transport: OfrepTransport,
    context: EvaluationContext,
    options: SnapshotOptions = {},
  ) {
    this.currentContext = { ...context };
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.firstLoad = this.refresh();
  }

  get status(): SnapshotStatus {
    return this.currentStatus;
  }

  /** The error of the last failed load, if the last load failed. */
  get error(): FluxGateError | undefined {
    return this.lastError;
  }

  get context(): EvaluationContext {
    return this.currentContext;
  }

  /** Increases on every change; handy as a cheap dependency for UI frameworks. */
  get revision(): number {
    return this.changes;
  }

  /** Resolves once the first load for the current context has finished, successfully or not. */
  ready(): Promise<void> {
    return this.firstLoad;
  }

  /** Evaluates a flag from the loaded set. The default value also sets the expected type. */
  evaluate<T>(key: string, defaultValue: T): FlagEvaluation<T> {
    if (this.currentStatus === 'NOT_READY') {
      return errorEvaluation(key, defaultValue, 'PROVIDER_NOT_READY', 'Flags are still loading');
    }
    if (this.currentStatus === 'ERROR') {
      return errorEvaluation(key, defaultValue, this.lastError?.errorCode ?? 'GENERAL', this.lastError?.message);
    }
    const flag = this.flags[key];
    if (!flag) {
      return errorEvaluation(key, defaultValue, 'FLAG_NOT_FOUND', `Flag '${key}' does not exist for this client`);
    }
    return toEvaluation(flag, defaultValue);
  }

  /** Keys of every loaded flag. */
  keys(): string[] {
    return Object.keys(this.flags);
  }

  /** Switches to another context, for example after sign-in, and loads its flags. */
  setContext(context: EvaluationContext): Promise<void> {
    this.currentContext = { ...context };
    this.flagVersion = undefined;
    this.firstLoad = this.refresh();
    return this.firstLoad;
  }

  /** Fetches the flags now instead of waiting for the next poll. */
  async refresh(): Promise<void> {
    if (this.closed) {
      return;
    }
    clearTimeout(this.timer);
    const generation = ++this.generation;
    const context = this.currentContext;
    try {
      const result = await this.transport.evaluateAll(context, this.flagVersion);
      if (generation !== this.generation || this.closed) {
        return; // A newer load superseded this one.
      }
      this.lastError = undefined;
      if (result.notModified) {
        this.setStatus('READY', []);
      } else {
        const changed = changedKeys(this.flags, result.flags);
        this.flags = result.flags;
        this.flagVersion = result.version;
        this.setStatus('READY', changed);
      }
    } catch (error) {
      if (generation !== this.generation || this.closed) {
        return;
      }
      this.lastError =
        error instanceof FluxGateError ? error : new FluxGateError('GENERAL', String(error), undefined, true);
      this.setStatus(Object.keys(this.flags).length > 0 ? 'STALE' : 'ERROR', []);
    } finally {
      if (generation === this.generation) {
        this.schedule();
      }
    }
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stops polling and drops the listeners. */
  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }

  private setStatus(status: SnapshotStatus, changed: string[]): void {
    if (status === this.currentStatus && changed.length === 0) {
      return;
    }
    this.currentStatus = status;
    this.changes++;
    for (const listener of [...this.listeners]) {
      try {
        listener(changed);
      } catch {
        // A failing listener must not stop the others.
      }
    }
  }

  private schedule(): void {
    if (this.closed || this.pollIntervalMs <= 0) {
      return;
    }
    this.timer = setTimeout(() => void this.refresh(), this.pollIntervalMs);
    // Do not keep a Node.js process alive just for polling.
    (this.timer as { unref?: () => void }).unref?.();
  }
}

function changedKeys(before: Record<string, ResolvedFlag>, after: Record<string, ResolvedFlag>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}
