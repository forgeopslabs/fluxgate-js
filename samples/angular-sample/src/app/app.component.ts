import { Component, inject, signal } from '@angular/core';
import { FluxGateFlagDirective, FluxGateService } from '@forgeops/fluxgate-angular';

export const USERS = [
  { targetingKey: 'user-1', country: 'CA', user_tier: 'plus' },
  { targetingKey: 'user-2', country: 'US', user_tier: 'free' },
  { targetingKey: 'user-3', country: 'US', user_tier: 'plus' },
  { targetingKey: 'user-4', country: 'DE', user_tier: 'free' },
];

@Component({
  selector: 'app-root',
  imports: [FluxGateFlagDirective],
  template: `
    <main>
      <h1>FluxGate Angular sample</h1>
      <label>
        Signed-in user
        <select (change)="signIn($any($event.target).value)">
          @for (user of users; track user.targetingKey) {
            <option [value]="user.targetingKey" [selected]="user.targetingKey === current()">
              {{ user.targetingKey }} ({{ user.country }}, {{ user.user_tier }})
            </option>
          }
        </select>
      </label>

      <p [class]="fluxgate.error() ? 'error' : 'status'">
        Flags: {{ fluxgate.status() }}
        @if (fluxgate.error(); as error) {
          ({{ error.errorCode }}: {{ error.message }})
        }
      </p>

      <section class="checkout" [class]="'checkout theme-' + theme().value">
        <h2 *fgFlag="'new-checkout'; else classic" id="checkout">New checkout</h2>
        <ng-template #classic><h2 id="checkout">Classic checkout</h2></ng-template>
        <p><code>new-checkout</code>: <strong id="new-checkout">{{ newCheckout() }}</strong></p>
        <p>
          <code>checkout-theme</code>: <strong id="checkout-theme">{{ theme().value }}</strong>
          (variant {{ theme().variant ?? '-' }}, reason {{ theme().reason }})
        </p>
      </section>
    </main>
  `,
})
export class AppComponent {
  protected readonly fluxgate = inject(FluxGateService);
  protected readonly users = USERS;
  protected readonly current = signal(USERS[0]!.targetingKey);
  protected readonly newCheckout = this.fluxgate.isEnabled('new-checkout');
  protected readonly theme = this.fluxgate.details('checkout-theme', 'classic');

  /** Switching user reloads the flags for the new context. */
  protected signIn(targetingKey: string): void {
    this.current.set(targetingKey);
    void this.fluxgate.setContext(USERS.find((user) => user.targetingKey === targetingKey)!);
  }
}
