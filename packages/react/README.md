# @forgeopslabs/fluxgate-react

React provider and hooks for FluxGate feature flags. Works with React 18 and 19, including
StrictMode.

```bash
npm install @forgeopslabs/fluxgate @forgeopslabs/fluxgate-react
```

## Usage

```tsx
import { FluxGateProvider, useFlag, useFlagDetails, useFluxGateStatus, useIsEnabled } from '@forgeopslabs/fluxgate-react';

const options = {
  baseUrl: 'https://edge.example.com',
  sdkKey: import.meta.env.VITE_FLUXGATE_SDK_KEY, // a Web client's SDK key
};

export function App({ user }: { user: User }) {
  return (
    <FluxGateProvider options={options} context={{ targetingKey: user.id, country: user.country }}>
      <Checkout />
    </FluxGateProvider>
  );
}

function Checkout() {
  const { ready } = useFluxGateStatus();
  const newCheckout = useIsEnabled('new-checkout');
  const theme = useFlag('checkout-theme', 'classic');
  const details = useFlagDetails('checkout-theme', 'classic'); // value, variant, reason, errorCode

  if (!ready) return <Spinner />;
  return newCheckout ? <NewCheckout theme={theme} /> : <ClassicCheckout />;
}
```

## API

| | |
|---|---|
| `<FluxGateProvider>` | Loads every flag for `context` in one call and polls for changes (`pollIntervalMs`, default 30000; `0` turns polling off). Pass `options` to create a client, or `client` to share an existing `FluxGateClient`. When `context` changes by value, the flags are reloaded. |
| `useFlag(key, default)` | The flag's value. The default is returned while loading and on errors, and sets the expected type. |
| `useFlagDetails(key, default)` | The full `FlagEvaluation`: `value`, `variant`, `reason`, `errorCode`, `errorMessage`, `metadata`. |
| `useIsEnabled(key)` | `true` only when a boolean flag is on. |
| `useFluxGateStatus()` | `{ status, ready, error }`, with `status` one of `NOT_READY`, `READY`, `STALE`, `ERROR`. |
| `useFluxGateClient()` | The underlying `FluxGateClient`, for on-demand evaluations. |

Components re-render only when the flags or the status change.

## Clients and targeting keys

Use a FluxGate **Web** client and list your app's origins in its **Web Origins**. `context` must
include a `targetingKey`: the signed-in user's ID, or a random ID stored on the device for anonymous
visitors.

See [`@forgeopslabs/fluxgate`](https://www.npmjs.com/package/@forgeopslabs/fluxgate) for how
evaluation works.

## License

Apache License 2.0
