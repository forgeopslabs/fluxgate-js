import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluxGateClient, type FlagSnapshot } from '../src';
import { BULK, FakeEdge } from './fake-edge';

const USER = { targetingKey: 'user-1', country: 'CA' };

function bulk(version: string, flags: unknown[]) {
  return { status: 200, headers: { ETag: version }, body: { flags } };
}

const V1 = bulk('v1', [
  { key: 'new-checkout', value: true, reason: 'TARGETING_MATCH' },
  { key: 'checkout-theme', value: 'express', variant: 'express', reason: 'TARGETING_MATCH' },
]);

let snapshot: FlagSnapshot | undefined;
afterEach(() => {
  snapshot?.close();
  vi.useRealTimers();
});

describe('FlagSnapshot', () => {
  it('is NOT_READY until the first load, then evaluates synchronously', async () => {
    const edge = new FakeEdge().on(BULK, V1);
    snapshot = new FluxGateClient(edge.options()).watch(USER, { pollIntervalMs: 0 });

    expect(snapshot.status).toBe('NOT_READY');
    expect(snapshot.evaluate('new-checkout', false)).toMatchObject({ value: false, errorCode: 'PROVIDER_NOT_READY' });

    await snapshot.ready();
    expect(snapshot.status).toBe('READY');
    expect(snapshot.evaluate('new-checkout', false).value).toBe(true);
    expect(snapshot.evaluate('checkout-theme', 'classic')).toMatchObject({ value: 'express', variant: 'express' });
    expect(snapshot.evaluate('missing', 'x')).toMatchObject({ value: 'x', errorCode: 'FLAG_NOT_FOUND' });
    expect(snapshot.keys().sort()).toEqual(['checkout-theme', 'new-checkout']);
    expect(edge.requests[0]!.body).toEqual({ context: USER });
  });

  it('reports ERROR when the first load fails', async () => {
    const edge = new FakeEdge().on(BULK, { status: 401, body: { errorCode: 'UNAUTHORIZED' } });
    snapshot = new FluxGateClient(edge.options()).watch(USER, { pollIntervalMs: 0 });
    await snapshot.ready();
    expect(snapshot.status).toBe('ERROR');
    expect(snapshot.error?.errorCode).toBe('UNAUTHORIZED');
    expect(snapshot.evaluate('new-checkout', false)).toMatchObject({ value: false, errorCode: 'UNAUTHORIZED' });
  });

  it('polls with If-None-Match, notifies changed keys, and keeps flags when a refresh fails', async () => {
    vi.useFakeTimers();
    const edge = new FakeEdge().on(
      BULK,
      V1,
      { status: 304, headers: { ETag: 'v1' } },
      bulk('v2', [
        { key: 'new-checkout', value: false, reason: 'DISABLED' },
        { key: 'checkout-theme', value: 'express', variant: 'express', reason: 'TARGETING_MATCH' },
      ]),
      { status: 500 },
    );
    snapshot = new FluxGateClient(edge.options()).watch(USER, { pollIntervalMs: 1000 });
    const changes: string[][] = [];
    snapshot.subscribe((keys) => changes.push(keys));
    await snapshot.ready();
    expect(changes).toEqual([['new-checkout', 'checkout-theme']]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(edge.requests[1]!.headers['If-None-Match']).toBe('v1');
    expect(changes).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(changes[1]).toEqual(['new-checkout']);
    expect(snapshot.evaluate('new-checkout', true)).toMatchObject({ value: false, reason: 'DISABLED' });

    await vi.advanceTimersByTimeAsync(1000);
    expect(snapshot.status).toBe('STALE');
    expect(snapshot.evaluate('checkout-theme', 'classic').value).toBe('express');
    const revision = snapshot.revision;

    snapshot.close();
    expect(snapshot.isClosed).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(edge.requests).toHaveLength(4);
    expect(snapshot.revision).toBe(revision);
  });

  it('reloads for a new context and ignores answers for the old one', async () => {
    let releaseFirst: (() => void) | undefined;
    const edge = new FakeEdge();
    const slowFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.context.targetingKey === 'user-1') {
        await new Promise<void>((resolve) => (releaseFirst = resolve));
        return new Response(JSON.stringify({ flags: [{ key: 'f', value: 'old', variant: 'old', reason: 'SPLIT' }] }), {
          status: 200,
        });
      }
      return edge.fetch(input, init);
    };
    edge.on(BULK, bulk('v2', [{ key: 'f', value: 'new', variant: 'new', reason: 'SPLIT' }]));
    snapshot = new FluxGateClient({ ...edge.options(), fetch: slowFetch }).watch(USER, { pollIntervalMs: 0 });

    const switched = snapshot.setContext({ targetingKey: 'user-2' });
    await switched;
    expect(snapshot.context).toEqual({ targetingKey: 'user-2' });
    releaseFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(snapshot.evaluate('f', '').value).toBe('new');
  });

  it('keeps notifying other listeners when one throws, and unsubscribes', async () => {
    const edge = new FakeEdge().on(BULK, V1);
    snapshot = new FluxGateClient(edge.options()).watch(USER, { pollIntervalMs: 0 });
    const seen: string[] = [];
    snapshot.subscribe(() => {
      throw new Error('boom');
    });
    const off = snapshot.subscribe(() => seen.push('second'));
    await snapshot.ready();
    expect(seen).toEqual(['second']);
    off();
    await snapshot.setContext({ targetingKey: 'user-9' });
    expect(seen).toEqual(['second']);
  });
});
