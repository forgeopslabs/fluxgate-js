import {
  ApplicationInitStatus,
  Component,
  inject,
  provideExperimentalZonelessChangeDetection,
  type Type,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FluxGateClient } from '@forgeops/fluxgate';
import { afterEach, describe, expect, it } from 'vitest';
import { FluxGateFlagDirective, FluxGateService, provideFluxGate, type FluxGateConfig } from '../dist';

const SDK_KEY = 'web-client.api-key';

interface Call {
  context: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Bulk answers: new-checkout is on for CA, checkout-theme is express for plus users. */
function fakeEdge(status = 200) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const { context } = JSON.parse(String(init?.body)) as { context: Record<string, unknown> };
    calls.push({ context, headers: init?.headers as Record<string, string> });
    if (status !== 200) {
      return new Response(JSON.stringify({ errorCode: 'UNAUTHORIZED' }), { status });
    }
    const plus = context['user_tier'] === 'plus';
    return new Response(
      JSON.stringify({
        flags: [
          { key: 'new-checkout', value: context['country'] === 'CA', reason: 'TARGETING_MATCH' },
          { key: 'checkout-theme', value: plus ? 'express' : 'classic', variant: plus ? 'express' : 'classic', reason: 'SPLIT' },
        ],
      }),
      { status: 200 },
    );
  };
  return { calls, options: { baseUrl: 'http://edge.test', sdkKey: SDK_KEY, fetch } };
}

async function setUp(config: FluxGateConfig): Promise<FluxGateService> {
  TestBed.configureTestingModule({
    providers: [provideExperimentalZonelessChangeDetection(), provideFluxGate({ pollIntervalMs: 0, ...config })],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  return TestBed.inject(FluxGateService);
}

async function render<T>(component: Type<T>): Promise<ComponentFixture<T>> {
  const fixture = TestBed.createComponent(component);
  await fixture.whenStable();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('provideFluxGate and FluxGateService', () => {
  it('waits for the first load at startup and exposes flags as signals', async () => {
    const edge = fakeEdge();
    const service = await setUp({ options: edge.options, context: { targetingKey: 'user-1', country: 'CA', user_tier: 'plus' } });

    expect(service.status()).toBe('READY');
    expect(service.ready()).toBe(true);
    expect(service.isEnabled('new-checkout')()).toBe(true);
    expect(service.flag('checkout-theme', 'classic')()).toBe('express');
    expect(service.details('checkout-theme', 'classic')()).toMatchObject({ variant: 'express', reason: 'SPLIT' });
    expect(service.value('missing', 'x')).toBe('x');
    expect(edge.calls[0]!.headers['Authorization']).toBe(`Bearer ${SDK_KEY}`);
  });

  it('updates the signals after setContext', async () => {
    const edge = fakeEdge();
    const service = await setUp({ options: edge.options, context: { targetingKey: 'user-1', country: 'US' } });
    const enabled = service.isEnabled('new-checkout');
    expect(enabled()).toBe(false);

    await service.setContext({ targetingKey: 'user-1', country: 'CA' });
    expect(enabled()).toBe(true);
    expect(edge.calls[1]!.context).toEqual({ targetingKey: 'user-1', country: 'CA' });
  });

  it('can start without waiting and reports errors', async () => {
    const edge = fakeEdge(401);
    const service = await setUp({ options: edge.options, context: { targetingKey: 'user-1' }, waitForReady: false });
    expect(service.status()).toBe('NOT_READY');
    await service.whenReady();
    expect(service.status()).toBe('ERROR');
    expect(service.error()?.errorCode).toBe('UNAUTHORIZED');
    expect(service.flag('checkout-theme', 'classic')()).toBe('classic');
  });

  it('accepts an existing client and refreshes on demand', async () => {
    const edge = fakeEdge();
    const client = new FluxGateClient(edge.options);
    const service = await setUp({ client, context: { targetingKey: 'user-1' } });
    expect(service.client).toBe(client);
    await service.refresh();
    expect(edge.calls).toHaveLength(2);
  });

  it('needs options or a client', async () => {
    TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection(), provideFluxGate({ context: { targetingKey: 'u' } })],
    });
    expect(() => TestBed.inject(ApplicationInitStatus)).toThrow(/options or client/);
  });
});

@Component({
  imports: [FluxGateFlagDirective],
  template: `
    <p id="on" *fgFlag="'new-checkout'; else off">new checkout</p>
    <ng-template #off><p id="off">classic checkout</p></ng-template>
    <span id="theme">{{ fluxgate.value('checkout-theme', 'classic') }}</span>
  `,
})
class CheckoutComponent {
  readonly fluxgate = inject(FluxGateService);
}

describe('FluxGateFlagDirective', () => {
  it('renders the template while the flag is on and the else template otherwise', async () => {
    const edge = fakeEdge();
    const service = await setUp({ options: edge.options, context: { targetingKey: 'user-1', country: 'US' } });
    const fixture = await render(CheckoutComponent);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#on')).toBeNull();
    expect(element.querySelector('#off')?.textContent).toBe('classic checkout');
    expect(element.querySelector('#theme')?.textContent).toBe('classic');

    await service.setContext({ targetingKey: 'user-1', country: 'CA', user_tier: 'plus' });
    await fixture.whenStable();
    expect(element.querySelector('#on')?.textContent).toBe('new checkout');
    expect(element.querySelector('#off')).toBeNull();
    expect(element.querySelector('#theme')?.textContent).toBe('express');
  });
});
