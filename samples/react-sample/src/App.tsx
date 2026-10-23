import { FluxGateProvider, useFlagDetails, useFluxGateStatus, useIsEnabled } from '@forgeopslabs/fluxgate-react';
import { useState } from 'react';

const options = {
  baseUrl: import.meta.env.FLUXGATE_WEB_BASE_URL || 'http://localhost:28081',
  // The Web client's SDK key: safe to ship to browsers, limited to its allowed origins.
  sdkKey: import.meta.env.FLUXGATE_WEB_SDK_KEY ?? '',
};

const users = [
  { targetingKey: 'user-1', country: 'CA', user_tier: 'plus' },
  { targetingKey: 'user-2', country: 'US', user_tier: 'free' },
  { targetingKey: 'user-3', country: 'US', user_tier: 'plus' },
  { targetingKey: 'user-4', country: 'DE', user_tier: 'free' },
];

export function App() {
  const [user, setUser] = useState(users[0]!);

  if (!options.sdkKey) {
    return <p className="error">Set FLUXGATE_WEB_SDK_KEY in samples/.env (run samples/setup.sh).</p>;
  }

  return (
    <main>
      <h1>FluxGate React sample</h1>
      <label>
        Signed-in user{' '}
        <select
          value={user.targetingKey}
          onChange={(event) => setUser(users.find((candidate) => candidate.targetingKey === event.target.value)!)}
        >
          {users.map((candidate) => (
            <option key={candidate.targetingKey} value={candidate.targetingKey}>
              {candidate.targetingKey} ({candidate.country}, {candidate.user_tier})
            </option>
          ))}
        </select>
      </label>
      {/* Changing `context` reloads the flags for the new user. */}
      <FluxGateProvider options={options} context={user} pollIntervalMs={5000}>
        <Status />
        <Checkout />
      </FluxGateProvider>
    </main>
  );
}

function Status() {
  const { status, error } = useFluxGateStatus();
  return (
    <p className={error ? 'error' : 'status'}>
      Flags: {status}
      {error ? ` (${error.errorCode}: ${error.message})` : ''}
    </p>
  );
}

function Checkout() {
  const newCheckout = useIsEnabled('new-checkout');
  const theme = useFlagDetails('checkout-theme', 'classic');
  return (
    <section className={`checkout theme-${theme.value}`}>
      <h2 data-testid="checkout">{newCheckout ? 'New checkout' : 'Classic checkout'}</h2>
      <p>
        <code>new-checkout</code>: <strong data-testid="new-checkout">{String(newCheckout)}</strong>
      </p>
      <p>
        <code>checkout-theme</code>: <strong data-testid="checkout-theme">{theme.value}</strong> (variant{' '}
        {theme.variant ?? '-'}, reason {theme.reason})
      </p>
    </section>
  );
}
