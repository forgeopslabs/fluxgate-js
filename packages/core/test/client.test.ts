import { describe, expect, it } from 'vitest';
import { FluxGateClient } from '../src';
import { BULK, FakeEdge, SDK_KEY, flag } from './fake-edge';

const USER = { targetingKey: 'user-1', country: 'CA' };

describe('FluxGateClient options', () => {
  it('rejects a missing or non-http base URL', () => {
    expect(() => new FluxGateClient({ baseUrl: '', sdkKey: SDK_KEY })).toThrow(/baseUrl/);
    expect(() => new FluxGateClient({ baseUrl: 'edge:8081', sdkKey: SDK_KEY })).toThrow(/http/);
  });

  it('rejects a malformed SDK key without echoing it', () => {
    for (const sdkKey of ['secret-without-dot', '.key', 'client.']) {
      expect(() => new FluxGateClient({ baseUrl: 'http://edge', sdkKey })).toThrow(/<clientId>\.<apiKey>/);
      try {
        new FluxGateClient({ baseUrl: 'http://edge', sdkKey });
      } catch (error) {
        expect(String(error)).not.toContain(sdkKey);
      }
    }
  });
});

describe('FluxGateClient.evaluate', () => {
  it('sends the SDK key and the context with targetingKey', async () => {
    const edge = new FakeEdge().on(flag('new-checkout'), {
      status: 200,
      body: { key: 'new-checkout', value: true, reason: 'TARGETING_MATCH' },
    });
    const client = new FluxGateClient(edge.options({ baseUrl: 'http://edge.test/' }));

    const evaluation = await client.evaluate('new-checkout', false, USER);

    expect(evaluation).toEqual({ key: 'new-checkout', value: true, reason: 'TARGETING_MATCH' });
    const [request] = edge.requests;
    expect(request!.url).toBe('http://edge.test/ofrep/v1/evaluate/flags/new-checkout');
    expect(request!.method).toBe('POST');
    expect(request!.headers.Authorization).toBe(`Bearer ${SDK_KEY}`);
    expect(request!.body).toEqual({ context: { targetingKey: 'user-1', country: 'CA' } });
  });

  it('returns string variants with their variant name and metadata', async () => {
    const edge = new FakeEdge().on(flag('checkout-theme'), {
      status: 200,
      body: { key: 'checkout-theme', value: 'express', variant: 'express', reason: 'TARGETING_MATCH', metadata: { team: 'checkout' } },
    });
    const client = new FluxGateClient(edge.options());

    expect(await client.evaluate('checkout-theme', 'classic', USER)).toEqual({
      key: 'checkout-theme',
      value: 'express',
      variant: 'express',
      reason: 'TARGETING_MATCH',
      metadata: { team: 'checkout' },
    });
    expect(await client.getString('checkout-theme', 'classic', USER)).toBe('express');
  });

  it('serializes Date attributes as ISO strings', async () => {
    const edge = new FakeEdge().on(flag('f'), { status: 200, body: { key: 'f', value: true, reason: 'STATIC' } });
    await new FluxGateClient(edge.options()).isEnabled('f', {
      targetingKey: 'u',
      signedUpAt: new Date('2026-01-02T03:04:05Z'),
    });
    expect(edge.requests[0]!.body).toEqual({ context: { targetingKey: 'u', signedUpAt: '2026-01-02T03:04:05.000Z' } });
  });

  it('treats the edge off marker as the default, whatever the type', async () => {
    const edge = new FakeEdge().on(flag('checkout-theme'), {
      status: 200,
      body: { key: 'checkout-theme', value: false, reason: 'DISABLED' },
    });
    const evaluation = await new FluxGateClient(edge.options()).evaluate('checkout-theme', 'classic', USER);
    expect(evaluation).toEqual({ key: 'checkout-theme', value: 'classic', reason: 'DISABLED' });
  });

  it('reports a type mismatch with the default value', async () => {
    const edge = new FakeEdge().on(flag('f'), { status: 200, body: { key: 'f', value: 'express', variant: 'express', reason: 'SPLIT' } });
    const evaluation = await new FluxGateClient(edge.options()).evaluate('f', 7, USER);
    expect(evaluation.value).toBe(7);
    expect(evaluation.errorCode).toBe('TYPE_MISMATCH');
    expect(evaluation.errorMessage).toMatch(/string value, expected number/);
  });

  it('accepts any value with a null default and objects with an object default', async () => {
    const edge = new FakeEdge()
      .on(flag('any'), { status: 200, body: { key: 'any', value: 42, reason: 'STATIC' } })
      .on(flag('obj'), { status: 200, body: { key: 'obj', value: { limit: 5 }, variant: 'v', reason: 'STATIC' } });
    const client = new FluxGateClient(edge.options());
    expect((await client.evaluate('any', null, USER)).value).toBe(42);
    expect(await client.getObject('obj', {}, USER)).toEqual({ limit: 5 });
  });

  it('returns the default when the edge resolves to the code default', async () => {
    const edge = new FakeEdge().on(flag('f'), { status: 200, body: { key: 'f', reason: 'DEFAULT' } });
    expect(await new FluxGateClient(edge.options()).evaluate('f', 'fallback', USER)).toEqual({
      key: 'f',
      value: 'fallback',
      reason: 'DEFAULT',
    });
  });

  it('fails locally without a targeting key', async () => {
    const edge = new FakeEdge();
    const evaluation = await new FluxGateClient(edge.options()).evaluate('f', false, { country: 'CA' });
    expect(evaluation.errorCode).toBe('TARGETING_KEY_MISSING');
    expect(edge.requests).toHaveLength(0);
  });

  it('rejects an empty flag key', async () => {
    const evaluation = await new FluxGateClient(new FakeEdge().options()).evaluate('', false, USER);
    expect(evaluation.errorCode).toBe('GENERAL');
  });

  it.each([
    [404, { key: 'f', errorCode: 'FLAG_NOT_FOUND', errorDetails: 'no such flag' }, 'FLAG_NOT_FOUND'],
    [401, { errorCode: 'UNAUTHORIZED', errorDetails: 'SDK key is invalid' }, 'UNAUTHORIZED'],
    [403, { errorCode: 'FORBIDDEN' }, 'UNAUTHORIZED'],
    [400, { key: 'f', errorCode: 'TARGETING_KEY_MISSING' }, 'TARGETING_KEY_MISSING'],
    [400, { key: 'f', errorCode: 'SOMETHING_NEW' }, 'INVALID_CONTEXT'],
    [500, undefined, 'GENERAL'],
  ])('maps HTTP %i to %s without retrying', async (status, body, code) => {
    const edge = new FakeEdge().on(flag('f'), { status, body });
    const evaluation = await new FluxGateClient(edge.options()).evaluate('f', true, USER);
    expect(evaluation).toMatchObject({ value: true, reason: 'ERROR', errorCode: code });
    expect(edge.count(flag('f'))).toBe(1);
  });

  it('retries 502, 503 and 504 and then succeeds', async () => {
    const edge = new FakeEdge().on(
      flag('f'),
      { status: 502 },
      { status: 503 },
      { status: 200, body: { key: 'f', value: true, reason: 'STATIC' } },
    );
    expect(await new FluxGateClient(edge.options()).isEnabled('f', USER)).toBe(true);
    expect(edge.count(flag('f'))).toBe(3);
  });

  it('gives up after maxAttempts', async () => {
    const edge = new FakeEdge().on(flag('f'), { status: 504 });
    const evaluation = await new FluxGateClient(edge.options({ retry: { maxAttempts: 2, initialBackoffMs: 0 } })).evaluate(
      'f',
      false,
      USER,
    );
    expect(evaluation.errorCode).toBe('GENERAL');
    expect(edge.count(flag('f'))).toBe(2);
  });

  it('retries network errors', async () => {
    const edge = new FakeEdge().on(flag('f'), new TypeError('fetch failed'), {
      status: 200,
      body: { key: 'f', value: true, reason: 'STATIC' },
    });
    expect(await new FluxGateClient(edge.options()).isEnabled('f', USER)).toBe(true);
  });

  it('times out slow answers', async () => {
    const slow: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const client = new FluxGateClient({
      baseUrl: 'http://edge.test',
      sdkKey: SDK_KEY,
      fetch: slow,
      timeoutMs: 20,
      retry: { maxAttempts: 1 },
    });
    const evaluation = await client.evaluate('f', false, USER);
    expect(evaluation.errorMessage).toMatch(/within 20 ms/);
  });

  it('reports a body that is not JSON as a parse error', async () => {
    const edge = new FakeEdge().on(flag('f'), { status: 200, body: 'not json' });
    expect((await new FluxGateClient(edge.options()).evaluate('f', false, USER)).errorCode).toBe('PARSE_ERROR');
  });

  it('passes a flag-level error code through', async () => {
    const edge = new FakeEdge().on(flag('f'), {
      status: 200,
      body: { key: 'f', value: false, reason: 'DEFAULT', errorCode: 'FLAG_NOT_FOUND' },
    });
    expect((await new FluxGateClient(edge.options()).evaluate('f', true, USER)).errorCode).toBe('FLAG_NOT_FOUND');
  });
});

describe('FluxGateClient cache', () => {
  const ok = { status: 200, body: { key: 'f', value: true, reason: 'STATIC' } };

  it('reuses a result for the same flag and context', async () => {
    const edge = new FakeEdge().on(flag('f'), ok);
    const client = new FluxGateClient(edge.options());
    await client.isEnabled('f', { targetingKey: 'u', a: 1, b: 2 });
    await client.isEnabled('f', { b: 2, a: 1, targetingKey: 'u' });
    expect(edge.count(flag('f'))).toBe(1);
    await client.isEnabled('f', { targetingKey: 'other' });
    expect(edge.count(flag('f'))).toBe(2);
  });

  it('does not cache errors, and can be cleared or disabled', async () => {
    const edge = new FakeEdge().on(flag('f'), { status: 404 }, ok);
    const client = new FluxGateClient(edge.options());
    await client.isEnabled('f', USER);
    await client.isEnabled('f', USER);
    await client.isEnabled('f', USER);
    expect(edge.count(flag('f'))).toBe(2);
    client.clearCache();
    await client.isEnabled('f', USER);
    expect(edge.count(flag('f'))).toBe(3);

    const uncached = new FakeEdge().on(flag('f'), ok);
    const noCache = new FluxGateClient(uncached.options({ cache: { enabled: false } }));
    await noCache.isEnabled('f', USER);
    await noCache.isEnabled('f', USER);
    expect(uncached.count(flag('f'))).toBe(2);
  });

  it('expires entries after the TTL and evicts the oldest when full', async () => {
    const edge = new FakeEdge().on(flag('f'), ok);
    const client = new FluxGateClient(edge.options({ cache: { ttlMs: 1, maxSize: 1 } }));
    await client.isEnabled('f', USER);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await client.isEnabled('f', USER);
    expect(edge.count(flag('f'))).toBe(2);

    const small = new FakeEdge().on(flag('f'), ok);
    const smallClient = new FluxGateClient(small.options({ cache: { maxSize: 1 } }));
    await smallClient.isEnabled('f', { targetingKey: 'a' });
    await smallClient.isEnabled('f', { targetingKey: 'b' });
    await smallClient.isEnabled('f', { targetingKey: 'a' });
    expect(small.count(flag('f'))).toBe(3);
  });
});

describe('FluxGateClient.evaluateAll and isHealthy', () => {
  it('returns flags by key with the ETag version, and notModified on 304', async () => {
    const edge = new FakeEdge().on(
      BULK,
      (request) =>
        request.headers['If-None-Match'] === 'v1'
          ? { status: 304, headers: { ETag: 'v1' } }
          : {
              status: 200,
              headers: { ETag: 'v1' },
              body: {
                flags: [
                  { key: 'new-checkout', value: true, reason: 'TARGETING_MATCH' },
                  { key: 'broken', errorCode: 'GENERAL', errorDetails: 'bad' },
                ],
              },
            },
    );
    const client = new FluxGateClient(edge.options());
    const first = await client.evaluateAll(USER);
    expect(first.version).toBe('v1');
    expect(first.flags['new-checkout']).toEqual({ key: 'new-checkout', value: true, reason: 'TARGETING_MATCH' });
    expect(first.flags.broken).toMatchObject({ errorCode: 'GENERAL', reason: 'ERROR' });
    expect(await client.evaluateAll(USER, 'v1')).toEqual({ notModified: true, version: 'v1', flags: {} });
  });

  it('falls back to metadata.version and rejects a body without flags', async () => {
    const edge = new FakeEdge().on(BULK, { status: 200, body: { flags: [], metadata: { version: 'm1' } } }, { status: 200, body: {} });
    const client = new FluxGateClient(edge.options());
    expect((await client.evaluateAll(USER)).version).toBe('m1');
    await expect(client.evaluateAll(USER)).rejects.toMatchObject({ errorCode: 'PARSE_ERROR' });
  });

  it('throws mapped errors from bulk calls', async () => {
    const edge = new FakeEdge().on(BULK, { status: 401, body: { errorCode: 'UNAUTHORIZED' } });
    await expect(new FluxGateClient(edge.options()).evaluateAll(USER)).rejects.toMatchObject({
      name: 'FluxGateError',
      errorCode: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('checks health without retrying', async () => {
    const healthy = new FakeEdge().on('/health', { status: 200, body: 'OK' });
    expect(await new FluxGateClient(healthy.options()).isHealthy()).toBe(true);
    const down = new FakeEdge().on('/health', { status: 503 });
    expect(await new FluxGateClient(down.options()).isHealthy()).toBe(false);
    const unreachable = new FakeEdge().on('/health', new TypeError('fetch failed'));
    expect(await new FluxGateClient(unreachable.options()).isHealthy()).toBe(false);
    expect(unreachable.count('/health')).toBe(1);
  });
});
