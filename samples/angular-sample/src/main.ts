import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideFluxGate } from '@forgeops/fluxgate-angular';
import { AppComponent, USERS } from './app/app.component';
import { fluxgateSettings } from './environments/fluxgate.generated';

bootstrapApplication(AppComponent, {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideFluxGate({
      // The Web client's SDK key: safe to ship to browsers, limited to its allowed origins.
      options: fluxgateSettings,
      context: USERS[0],
      pollIntervalMs: 5000,
    }),
  ],
}).catch((error: unknown) => console.error(error));
