import type { Signal } from '@angular/core';
import type { FlagEvaluation } from '@forgeops/fluxgate';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FluxGateService } from '../src/public-api';

// Checked by `pnpm typecheck`, not at run time: a literal default such as
// 'classic' must give `string`, or comparing the value with 'express' in a
// template or `computed` fails to compile.
function serviceTypes(fluxgate: FluxGateService) {
  expectTypeOf(fluxgate.flag('checkout-theme', 'classic')).toEqualTypeOf<Signal<string>>();
  expectTypeOf(fluxgate.flag('new-checkout', false)).toEqualTypeOf<Signal<boolean>>();
  expectTypeOf(fluxgate.details('checkout-theme', 'classic')).toEqualTypeOf<Signal<FlagEvaluation<string>>>();

  expectTypeOf(fluxgate.value('checkout-theme', 'classic')).toEqualTypeOf<string>();
  expectTypeOf(fluxgate.value('limit', 3)).toEqualTypeOf<number>();
  expectTypeOf(fluxgate.value('new-checkout', false)).toEqualTypeOf<boolean>();
  // An explicit type keeps a union of variants.
  expectTypeOf(fluxgate.value<'classic' | 'express'>('checkout-theme', 'classic')).toEqualTypeOf<
    'classic' | 'express'
  >();
  expectTypeOf(fluxgate.evaluate('checkout-theme', 'classic')).toEqualTypeOf<FlagEvaluation<string>>();

  // `expectTypeOf(...)` widens a fresh literal by itself; these comparisons do not.
  const theme = fluxgate.flag('checkout-theme', 'classic');
  expect(theme() === 'express').toBeTypeOf('boolean');
  const current = fluxgate.value('checkout-theme', 'classic');
  expect(current === 'express').toBeTypeOf('boolean');
}

describe('types', () => {
  it('widens literal defaults to their primitive type', () => {
    expect(serviceTypes).toBeTypeOf('function');
  });
});
