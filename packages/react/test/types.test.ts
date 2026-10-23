import type { FlagEvaluation } from '@forgeops/fluxgate';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { useFlag, useFlagDetails } from '../src';

// Checked by `pnpm typecheck`, not at run time (hooks need a component): a
// literal default such as 'classic' must give `string`, or comparing the
// value with 'express' fails to compile.
function hookTypes() {
  expectTypeOf(useFlag('checkout-theme', 'classic')).toEqualTypeOf<string>();
  expectTypeOf(useFlag('limit', 3)).toEqualTypeOf<number>();
  expectTypeOf(useFlag('new-checkout', false)).toEqualTypeOf<boolean>();
  expectTypeOf(useFlag('config', { limit: 5 })).toEqualTypeOf<{ limit: number }>();
  // An explicit type keeps a union of variants.
  expectTypeOf(useFlag<'classic' | 'express'>('checkout-theme', 'classic')).toEqualTypeOf<'classic' | 'express'>();

  // `expectTypeOf(...)` widens a fresh literal by itself; this comparison does not.
  const theme = useFlag('checkout-theme', 'classic');
  expect(theme === 'express').toBeTypeOf('boolean');

  expectTypeOf(useFlagDetails('checkout-theme', 'classic')).toEqualTypeOf<FlagEvaluation<string>>();
  expectTypeOf(useFlagDetails('new-checkout', false)).toEqualTypeOf<FlagEvaluation<boolean>>();
}

describe('types', () => {
  it('widens literal defaults to their primitive type', () => {
    expect(hookTypes).toBeTypeOf('function');
  });
});
