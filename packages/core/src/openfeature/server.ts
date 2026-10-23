import type { EvaluationContext, JsonValue, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import { FluxGateClient } from '../client';
import type { FluxGateOptions } from '../options';
import type { JsonValue as FluxGateJsonValue } from '../types';
import { anyTypeEvaluation, toFluxGateContext, toResolution } from './shared';

/**
 * OpenFeature provider for `@openfeature/server-sdk` (Node.js). Every
 * evaluation is one OFREP call for that request's context, cached briefly by
 * the {@link FluxGateClient}.
 *
 * ```ts
 * await OpenFeature.setProviderAndWait(new FluxGateServerProvider({ baseUrl, sdkKey }));
 * const client = OpenFeature.getClient();
 * await client.getBooleanValue('new-checkout', false, { targetingKey: 'user-1' });
 * ```
 */
export class FluxGateServerProvider implements Provider {
  readonly metadata = { name: 'FluxGate' } as const;
  readonly runsOn = 'server';

  private readonly client: FluxGateClient;

  constructor(clientOrOptions: FluxGateClient | FluxGateOptions) {
    this.client = clientOrOptions instanceof FluxGateClient ? clientOrOptions : new FluxGateClient(clientOrOptions);
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(flagKey, defaultValue, context);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve(flagKey, defaultValue, context);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve(flagKey, defaultValue, context);
  }

  /** Accepts a flag of any type; see {@link anyTypeEvaluation}. */
  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    const evaluation = await this.client.evaluate(flagKey, null, toFluxGateContext(context));
    return toResolution(anyTypeEvaluation(evaluation, defaultValue));
  }

  private async resolve<T>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
    const evaluation = await this.client.evaluate(
      flagKey,
      defaultValue as unknown as FluxGateJsonValue,
      toFluxGateContext(context),
    );
    return toResolution({ ...evaluation, value: evaluation.value as unknown as T });
  }
}
