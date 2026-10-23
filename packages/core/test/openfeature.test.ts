import { OpenFeature as ServerOpenFeature } from '@openfeature/server-sdk';
import { OpenFeature as WebOpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { FluxGateServerProvider } from '../src/openfeature/server';
import { FluxGateWebProvider } from '../src/openfeature/web';
import { BULK, FakeEdge, flag } from './fake-edge';

afterEach(async () => {
  await WebOpenFeature.close();
  await ServerOpenFeature.close();
});

describe('FluxGateWebProvider', () => {
  it('loads the flags for the static context and resolves synchronously', async () => {
    const edge = new FakeEdge().on(BULK, {
      status: 200,
      headers: { ETag: 'v1' },
      body: {
        flags: [
          { key: 'new-checkout', value: true, reason: 'TARGETING_MATCH', metadata: { team: 'checkout', nested: { a: 1 } } },
          { key: 'checkout-theme', value: 'express', variant: 'express', reason: 'TARGETING_MATCH' },
        ],
      },
    });
    await WebOpenFeature.setContext({ targetingKey: 'user-1', country: 'CA', since: new Date('2026-01-01T00:00:00Z') });
    await WebOpenFeature.setProviderAndWait(new FluxGateWebProvider(edge.options(), { pollIntervalMs: 0 }));
    const client = WebOpenFeature.getClient();

    expect(client.getBooleanValue('new-checkout', false)).toBe(true);
    const details = client.getStringDetails('checkout-theme', 'classic');
    expect(details).toMatchObject({ value: 'express', variant: 'express', reason: 'TARGETING_MATCH' });
    expect(client.getBooleanDetails('new-checkout', false).flagMetadata).toEqual({ team: 'checkout' });
    expect(client.getNumberDetails('checkout-theme', 3)).toMatchObject({ value: 3, errorCode: 'TYPE_MISMATCH' });
    expect(client.getObjectDetails('missing', {})).toMatchObject({ value: {}, errorCode: 'FLAG_NOT_FOUND' });
    expect(client.getObjectDetails('checkout-theme', 'none')).toMatchObject({ value: 'express', variant: 'express' });
    expect(edge.requests[0]!.body).toEqual({
      context: { targetingKey: 'user-1', country: 'CA', since: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('reloads when the context changes', async () => {
    const edge = new FakeEdge().on(BULK, (request) => ({
      status: 200,
      body: {
        flags: [
          {
            key: 'new-checkout',
            value: (request.body as { context: { country: string } }).context.country === 'CA',
            reason: 'TARGETING_MATCH',
          },
        ],
      },
    }));
    await WebOpenFeature.setContext({ targetingKey: 'user-1', country: 'US' });
    await WebOpenFeature.setProviderAndWait(new FluxGateWebProvider(edge.options(), { pollIntervalMs: 0 }));
    const client = WebOpenFeature.getClient();
    expect(client.getBooleanValue('new-checkout', true)).toBe(false);

    await WebOpenFeature.setContext({ targetingKey: 'user-1', country: 'CA' });
    expect(client.getBooleanValue('new-checkout', false)).toBe(true);
  });

  it('fails initialization when the first load fails', async () => {
    const edge = new FakeEdge().on(BULK, { status: 401, body: { errorCode: 'UNAUTHORIZED' } });
    await WebOpenFeature.setContext({ targetingKey: 'user-1' });
    await expect(
      WebOpenFeature.setProviderAndWait(new FluxGateWebProvider(edge.options(), { pollIntervalMs: 0 })),
    ).rejects.toBeDefined();
  });

  it('emits ConfigurationChanged and Stale while polling', async () => {
    const edge = new FakeEdge().on(
      BULK,
      { status: 200, headers: { ETag: 'v1' }, body: { flags: [{ key: 'f', value: true, reason: 'STATIC' }] } },
      { status: 200, headers: { ETag: 'v2' }, body: { flags: [{ key: 'f', value: false, reason: 'DISABLED' }] } },
      { status: 500 },
    );
    const provider = new FluxGateWebProvider(edge.options(), { pollIntervalMs: 10 });
    const events: string[] = [];
    provider.events.addHandler(ProviderEvents.ConfigurationChanged, (details) =>
      events.push(`changed:${(details as { flagsChanged?: string[] } | undefined)?.flagsChanged?.join(',')}`),
    );
    provider.events.addHandler(ProviderEvents.Stale, () => events.push('stale'));
    await WebOpenFeature.setContext({ targetingKey: 'user-1' });
    await WebOpenFeature.setProviderAndWait(provider);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events.slice(0, 3)).toEqual(['changed:f', 'changed:f', 'stale']);
  });

  it('answers PROVIDER_NOT_READY before initialization', () => {
    const provider = new FluxGateWebProvider(new FakeEdge().options());
    expect(provider.resolveBooleanEvaluation('f', true)).toMatchObject({ value: true, errorCode: 'PROVIDER_NOT_READY' });
  });
});

describe('FluxGateServerProvider', () => {
  it('evaluates each call for its own context', async () => {
    const edge = new FakeEdge()
      .on(flag('new-checkout'), (request) => ({
        status: 200,
        body: {
          key: 'new-checkout',
          value: (request.body as { context: { country?: string } }).context.country === 'CA',
          reason: 'TARGETING_MATCH',
        },
      }))
      .on(flag('checkout-theme'), {
        status: 200,
        body: { key: 'checkout-theme', value: 'express', variant: 'express', reason: 'TARGETING_MATCH' },
      })
      .on(flag('limits'), { status: 200, body: { key: 'limits', value: { max: 3 }, variant: 'v', reason: 'STATIC' } })
      .on(flag('ratio'), { status: 200, body: { key: 'ratio', value: 0.5, variant: 'half', reason: 'STATIC' } });
    await ServerOpenFeature.setProviderAndWait(new FluxGateServerProvider(edge.options()));
    const client = ServerOpenFeature.getClient();

    expect(await client.getBooleanValue('new-checkout', false, { targetingKey: 'u1', country: 'CA' })).toBe(true);
    expect(await client.getBooleanValue('new-checkout', true, { targetingKey: 'u2', country: 'US' })).toBe(false);
    expect(await client.getStringDetails('checkout-theme', 'classic', { targetingKey: 'u1' })).toMatchObject({
      value: 'express',
      variant: 'express',
    });
    expect(await client.getObjectValue('limits', {}, { targetingKey: 'u1' })).toEqual({ max: 3 });
    expect(await client.getNumberValue('ratio', 0, { targetingKey: 'u1' })).toBe(0.5);
    expect(await client.getObjectValue('checkout-theme', 'none', { targetingKey: 'u1' })).toBe('express');
    expect(await client.getObjectDetails('new-checkout', 'off', { targetingKey: 'u2', country: 'US' })).toMatchObject({
      value: 'off',
      reason: 'TARGETING_MATCH',
    });
    expect(await client.getBooleanDetails('new-checkout', false, {})).toMatchObject({
      errorCode: 'TARGETING_KEY_MISSING',
    });
    expect(await client.getBooleanDetails('missing', false, { targetingKey: 'u1' })).toMatchObject({
      errorCode: 'FLAG_NOT_FOUND',
    });
  });
});
