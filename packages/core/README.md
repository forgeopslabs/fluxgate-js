# @forgeopslabs/fluxgate

FluxGate feature flag client for browsers and Node.js 20+. It evaluates flags against a FluxGate
edge server over [OFREP](https://openfeature.dev/specification/appendix-c), authenticated with a
FluxGate client's SDK key. No runtime dependencies.

```bash
npm install @forgeopslabs/fluxgate
```

For React use [`@forgeopslabs/fluxgate-react`](https://www.npmjs.com/package/@forgeopslabs/fluxgate-react),
for Angular [`@forgeopslabs/fluxgate-angular`](https://www.npmjs.com/package/@forgeopslabs/fluxgate-angular).

## FluxGateClient

```ts
import { FluxGateClient } from '@forgeopslabs/fluxgate';

const fluxgate = new FluxGateClient({
  baseUrl: 'https://edge.example.com',
  sdkKey: process.env.FLUXGATE_SDK_KEY!, // <clientId>.<apiKey>
});

const user = { targetingKey: 'user-1', country: 'CA', user_tier: 'plus' };

await fluxgate.isEnabled('new-checkout', user); // boolean flags
await fluxgate.getString('checkout-theme', 'classic', user);
await fluxgate.getNumber('max-items', 10, user);
await fluxgate.getObject('limits', { max: 3 }, user);

const evaluation = await fluxgate.evaluate('checkout-theme', 'classic', user);
// { key, value, variant, reason, errorCode?, errorMessage?, metadata? }
```

- **Never throws.** On any error the evaluation returns your default with an `errorCode`
  (`FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `TARGETING_KEY_MISSING`, `INVALID_CONTEXT`,
  `PROVIDER_NOT_READY`, `PARSE_ERROR`, `UNAUTHORIZED` or `GENERAL`).
- **The default sets the type.** A boolean default accepts only a boolean, and so on. Pass `null`
  to accept any value.
- **`targetingKey` is required.** Without it the evaluation fails locally with
  `TARGETING_KEY_MISSING`. Other context properties are targeting attributes; `Date` values are sent
  as ISO strings.
- **"Off" answers.** A disabled or undeployed flag answers `false` with no variant, whatever its
  type. Non-boolean reads then return your default with the edge's reason.

### Options

| Option | Default | Meaning |
|---|---|---|
| `baseUrl` | (required) | Edge server URL, `http://` or `https://`. |
| `sdkKey` | (required) | SDK key, `<clientId>.<apiKey>`. Sent as `Authorization: Bearer`. |
| `timeoutMs` | `5000` | Timeout for one request. |
| `retry.maxAttempts` | `3` | Attempts per call, counting the first. Network errors, timeouts and HTTP 502, 503 and 504 are retried. |
| `retry.initialBackoffMs` | `100` | Pause before the first retry, doubled each time. |
| `cache.enabled` | `true` | Cache successful single-flag results per flag and context. |
| `cache.ttlMs` | `30000` | Cache lifetime. |
| `cache.maxSize` | `1000` | Maximum cached results; the oldest go first. |
| `fetch` | global `fetch` | `fetch` implementation, for example for tests or proxies. |

### Bulk evaluation and health

```ts
const all = await fluxgate.evaluateAll(user); // { flags: { [key]: ResolvedFlag }, version }
const again = await fluxgate.evaluateAll(user, all.version); // { notModified: true } when unchanged
await fluxgate.isHealthy(); // GET /health
```

`evaluateAll` throws a `FluxGateError` (with `errorCode` and `status`) on failure.

## FlagSnapshot

`watch()` loads every flag for one context, keeps them current by polling with `If-None-Match`, and
answers evaluations synchronously. This is what the React and Angular adapters use.

```ts
const snapshot = fluxgate.watch({ targetingKey: 'user-1' }, { pollIntervalMs: 30_000 });
await snapshot.ready();
snapshot.evaluate('checkout-theme', 'classic'); // FlagEvaluation, synchronous
snapshot.subscribe((changedKeys) => render());
await snapshot.setContext({ targetingKey: 'user-2' }); // after sign-in
snapshot.close();
```

`snapshot.status` is `NOT_READY`, `READY`, `STALE` (a refresh failed; the last flags are still
served) or `ERROR` (the first load failed; evaluations return defaults).

## OpenFeature

Browsers, with `@openfeature/web-sdk`:

```ts
import { OpenFeature } from '@openfeature/web-sdk';
import { FluxGateWebProvider } from '@forgeopslabs/fluxgate/openfeature/web';

await OpenFeature.setContext({ targetingKey: 'user-1', country: 'CA' });
await OpenFeature.setProviderAndWait(new FluxGateWebProvider({ baseUrl, sdkKey }));
OpenFeature.getClient().getStringValue('checkout-theme', 'classic');
```

The web provider loads all flags in one call, reloads on `OpenFeature.setContext`, and emits
`ConfigurationChanged` (with the changed keys) and `Stale` while polling.

Node.js, with `@openfeature/server-sdk`:

```ts
import { OpenFeature } from '@openfeature/server-sdk';
import { FluxGateServerProvider } from '@forgeopslabs/fluxgate/openfeature/server';

await OpenFeature.setProviderAndWait(new FluxGateServerProvider({ baseUrl, sdkKey }));
await OpenFeature.getClient().getBooleanValue('new-checkout', false, { targetingKey: 'user-1' });
```

Object evaluations (`getObjectValue`) accept a flag of any type.

## Browsers

Use a FluxGate **Web** client in browsers and list your app's origins in its **Web Origins**. The
edge answers a Web client only from those origins. Its SDK key is visible to anyone using your app,
which is expected; never ship a Backend client's key to a browser.

## License

Apache License 2.0
