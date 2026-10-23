import { inject, makeEnvironmentProviders, provideAppInitializer, type EnvironmentProviders } from '@angular/core';
import { FLUXGATE_CONFIG, type FluxGateConfig } from './config';
import { FluxGateService } from './fluxgate.service';

/**
 * Sets up FluxGate for an application.
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideFluxGate({
 *       options: { baseUrl: 'https://edge.example.com', sdkKey: environment.fluxgateSdkKey },
 *       context: { targetingKey: anonymousId() },
 *     }),
 *   ],
 * });
 * ```
 */
export function provideFluxGate(config: FluxGateConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FLUXGATE_CONFIG, useValue: config },
    FluxGateService,
    provideAppInitializer(() => {
      const service = inject(FluxGateService);
      return config.waitForReady === false ? undefined : service.whenReady();
    }),
  ]);
}
