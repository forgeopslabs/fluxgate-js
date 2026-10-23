# @forgeops/fluxgate-angular

Angular providers, signals and a structural directive for FluxGate feature flags. Works with
Angular 19 and later, with or without zone.js.

```bash
npm install @forgeops/fluxgate @forgeops/fluxgate-angular
```

## Setup

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideFluxGate } from '@forgeops/fluxgate-angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideFluxGate({
      options: { baseUrl: 'https://edge.example.com', sdkKey: environment.fluxgateSdkKey }, // a Web client's SDK key
      context: { targetingKey: anonymousId() },
    }),
  ],
});
```

| Setting | Default | Meaning |
|---|---|---|
| `options` or `client` | (one required) | Settings for a new `FluxGateClient`, or an existing one. |
| `context` | (required) | Who the flags are evaluated for at startup. Must include `targetingKey`. |
| `pollIntervalMs` | `30000` | How often to re-fetch the flags; `0` turns polling off. |
| `waitForReady` | `true` | Delay application start until the first load finishes, so templates never show defaults first. |

## Signals

```ts
@Component({
  selector: 'app-checkout',
  template: `
    @if (newCheckout()) {
      <app-new-checkout [theme]="theme()" />
    } @else {
      <app-classic-checkout />
    }
  `,
})
export class CheckoutComponent {
  private readonly fluxgate = inject(FluxGateService);
  readonly newCheckout = this.fluxgate.isEnabled('new-checkout');
  readonly theme = this.fluxgate.flag('checkout-theme', 'classic');
}
```

| `FluxGateService` | |
|---|---|
| `flag(key, default)` | The flag's value as a signal. The default is returned while loading and on errors, and sets the expected type. |
| `details(key, default)` | The full `FlagEvaluation` as a signal: `value`, `variant`, `reason`, `errorCode`. |
| `isEnabled(key)` | A boolean flag as a signal; `true` only when it is on. |
| `value(key, default)`, `evaluate(key, default)` | Reactive reads for templates, `computed` and `effect`. |
| `status`, `ready`, `error` | Load status signals. `status` is `NOT_READY`, `READY`, `STALE` or `ERROR`. |
| `setContext(context)` | Switches to another context, for example after sign-in, and reloads the flags. |
| `refresh()`, `whenReady()` | Load now; wait for the current load. |
| `client` | The underlying `FluxGateClient`. |

## Directive

```html
<app-new-checkout *fgFlag="'new-checkout'; else classic" />
<ng-template #classic><app-classic-checkout /></ng-template>
```

Import `FluxGateFlagDirective` in the component.

## Clients and targeting keys

Use a FluxGate **Web** client and list your app's origins in its **Web Origins**. The context must
include a `targetingKey`: the signed-in user's ID, or a random ID stored on the device for anonymous
visitors.

See [`@forgeops/fluxgate`](https://www.npmjs.com/package/@forgeops/fluxgate) for how
evaluation works.

## License

Apache License 2.0
