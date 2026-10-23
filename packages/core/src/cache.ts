import type { EvaluationContext, ResolvedFlag } from './types';

/**
 * Short-lived cache of successful single-flag evaluations, keyed by flag key
 * and context. Oldest entries are dropped first when it is full.
 */
export class EvaluationCache {
  private readonly entries = new Map<string, { flag: ResolvedFlag; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, context: EvaluationContext): ResolvedFlag | undefined {
    const id = cacheKey(key, context);
    const entry = this.entries.get(id);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry.flag;
  }

  set(key: string, context: EvaluationContext, flag: ResolvedFlag): void {
    const id = cacheKey(key, context);
    this.entries.delete(id);
    this.entries.set(id, { flag, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

function cacheKey(key: string, context: EvaluationContext): string {
  return `${key}\u0000${stableStringify(context)}`;
}

/** JSON with object keys sorted, so equal contexts give equal strings. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return item;
  });
}
