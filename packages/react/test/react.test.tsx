import { FluxGateClient } from '@forgeops/fluxgate';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FluxGateProvider,
  useFlag,
  useFlagDetails,
  useFluxGateClient,
  useFluxGateStatus,
  useIsEnabled,
} from '../src';

const BASE_URL = 'http://edge.test';
const SDK_KEY = 'web-client.api-key';

interface Call {
  body: { context: Record<string, unknown> };
  headers: Record<string, string>;
}

/** A fetch that answers bulk calls: new-checkout is on for CA, checkout-theme is express for plus. */
function fakeEdge(status = 200) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Call['body'];
    calls.push({ body, headers: init?.headers as Record<string, string> });
    if (status !== 200) {
      return new Response(JSON.stringify({ errorCode: 'UNAUTHORIZED' }), { status });
    }
    const { country, user_tier: tier } = body.context;
    return new Response(
      JSON.stringify({
        flags: [
          { key: 'new-checkout', value: country === 'CA', reason: 'TARGETING_MATCH' },
          {
            key: 'checkout-theme',
            value: tier === 'plus' ? 'express' : 'classic',
            variant: tier === 'plus' ? 'express' : 'classic',
            reason: 'TARGETING_MATCH',
          },
        ],
      }),
      { status: 200, headers: { ETag: `v-${String(country)}-${String(tier)}` } },
    );
  };
  return { calls, options: { baseUrl: BASE_URL, sdkKey: SDK_KEY, fetch } };
}

function Flags() {
  const status = useFluxGateStatus();
  const enabled = useIsEnabled('new-checkout');
  const theme = useFlag('checkout-theme', 'classic');
  const details = useFlagDetails('checkout-theme', 'classic');
  return (
    <div>
      <span data-testid="status">{status.status}</span>
      <span data-testid="ready">{String(status.ready)}</span>
      <span data-testid="enabled">{String(enabled)}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="variant">{details.variant ?? '-'}</span>
      <span data-testid="error">{status.error?.errorCode ?? '-'}</span>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

afterEach(cleanup);

describe('FluxGateProvider', () => {
  it('shows defaults while loading, then the flags for the context', async () => {
    const edge = fakeEdge();
    render(
      <FluxGateProvider options={edge.options} context={{ targetingKey: 'user-1', country: 'CA', user_tier: 'plus' }} pollIntervalMs={0}>
        <Flags />
      </FluxGateProvider>,
    );
    expect(text('status')).toBe('NOT_READY');
    expect(text('theme')).toBe('classic');

    await waitFor(() => expect(text('status')).toBe('READY'));
    expect(text('ready')).toBe('true');
    expect(text('enabled')).toBe('true');
    expect(text('theme')).toBe('express');
    expect(text('variant')).toBe('express');
    expect(edge.calls[0]!.headers.Authorization).toBe(`Bearer ${SDK_KEY}`);
  });

  it('reloads when the context changes by value, not by identity', async () => {
    const edge = fakeEdge();
    let setCountry: (country: string) => void = () => {};
    function App() {
      const [country, set] = useState('US');
      setCountry = set;
      return (
        <FluxGateProvider options={edge.options} context={{ targetingKey: 'user-1', country }} pollIntervalMs={0}>
          <Flags />
        </FluxGateProvider>
      );
    }
    const { rerender } = render(<App />);
    await waitFor(() => expect(text('status')).toBe('READY'));
    expect(text('enabled')).toBe('false');

    rerender(<App />);
    expect(edge.calls).toHaveLength(1);

    act(() => setCountry('CA'));
    await waitFor(() => expect(text('enabled')).toBe('true'));
    expect(edge.calls).toHaveLength(2);
    expect(edge.calls[1]!.body.context).toEqual({ targetingKey: 'user-1', country: 'CA' });
  });

  it('survives StrictMode double mounting', async () => {
    const edge = fakeEdge();
    render(
      <StrictMode>
        <FluxGateProvider options={edge.options} context={{ targetingKey: 'user-1', country: 'CA' }} pollIntervalMs={0}>
          <Flags />
        </FluxGateProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(text('enabled')).toBe('true'));
    expect(text('status')).toBe('READY');
  });

  it('reports load errors and keeps defaults', async () => {
    const edge = fakeEdge(401);
    render(
      <FluxGateProvider options={edge.options} context={{ targetingKey: 'user-1' }} pollIntervalMs={0}>
        <Flags />
      </FluxGateProvider>,
    );
    await waitFor(() => expect(text('status')).toBe('ERROR'));
    expect(text('error')).toBe('UNAUTHORIZED');
    expect(text('ready')).toBe('false');
    expect(text('theme')).toBe('classic');
  });

  it('accepts an existing client and exposes it', async () => {
    const edge = fakeEdge();
    const client = new FluxGateClient(edge.options);
    let seen: FluxGateClient | undefined;
    function ClientUser() {
      seen = useFluxGateClient();
      return null;
    }
    render(
      <FluxGateProvider client={client} context={{ targetingKey: 'user-1' }} pollIntervalMs={0}>
        <ClientUser />
      </FluxGateProvider>,
    );
    expect(seen).toBe(client);
  });

  it('throws when hooks are used outside the provider', () => {
    const error = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Flags />)).toThrow(/inside <FluxGateProvider>/);
    } finally {
      console.error = error;
    }
  });
});
