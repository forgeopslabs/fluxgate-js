import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FlagEvaluation, FlagSnapshot, FluxGateClient, JsonValue } from '../src';

// Checked by `pnpm typecheck`, not at run time: a literal default such as
// 'classic' must give `string`, or comparing the value with 'express' fails
// to compile.
function evaluationTypes(client: FluxGateClient, snapshot: FlagSnapshot) {
  expectTypeOf(client.evaluate('checkout-theme', 'classic')).toEqualTypeOf<Promise<FlagEvaluation<string>>>();
  expectTypeOf(client.evaluate('limit', 3)).toEqualTypeOf<Promise<FlagEvaluation<number>>>();
  expectTypeOf(client.evaluate('new-checkout', false)).toEqualTypeOf<Promise<FlagEvaluation<boolean>>>();
  expectTypeOf(client.evaluate('config', null)).toEqualTypeOf<Promise<FlagEvaluation<null>>>();
  expectTypeOf(client.evaluate('config', { limit: 5 })).toEqualTypeOf<Promise<FlagEvaluation<{ limit: number }>>>();
  // An explicit type keeps a union of variants.
  expectTypeOf(client.evaluate<'classic' | 'express'>('checkout-theme', 'classic')).toEqualTypeOf<
    Promise<FlagEvaluation<'classic' | 'express'>>
  >();
  expectTypeOf(client.evaluate('any', null as JsonValue)).toEqualTypeOf<Promise<FlagEvaluation<JsonValue>>>();

  expectTypeOf(snapshot.evaluate('checkout-theme', 'classic')).toEqualTypeOf<FlagEvaluation<string>>();
  expectTypeOf(snapshot.evaluate('new-checkout', false)).toEqualTypeOf<FlagEvaluation<boolean>>();
}

describe('types', () => {
  it('widens literal defaults to their primitive type', () => {
    expect(evaluationTypes).toBeTypeOf('function');
  });
});
