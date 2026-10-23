# FluxGate TypeScript SDK

TypeScript and JavaScript libraries for the FluxGate feature toggle edge server. They evaluate flags
over [OFREP](https://openfeature.dev/specification/appendix-c) (the OpenFeature Remote Evaluation
Protocol), authenticated with a FluxGate client's SDK key.

| Package | Use it for |
|---|---|
| [`@forgeops/fluxgate`](packages/core) | Browsers and Node.js 20+. `FluxGateClient` (retries, timeouts, cache), `FlagSnapshot` for synchronous evaluations with polling, and OpenFeature providers for `@openfeature/web-sdk` and `@openfeature/server-sdk`. No dependencies. |
| [`@forgeops/fluxgate-react`](packages/react) | React 18+. `FluxGateProvider` and the hooks `useFlag`, `useFlagDetails`, `useIsEnabled`, `useFluxGateStatus`. |
| [`@forgeops/fluxgate-angular`](packages/angular) | Angular 19+. `provideFluxGate()`, `FluxGateService` with signals, and the `*fgFlag` directive. |

[samples/](samples/) holds a Node.js app, a React app and an Angular app that run against a local
FluxGate stack, which `samples/docker-compose.yml` starts.

## Quick start

```bash
npm install @forgeops/fluxgate
```

```ts
import { FluxGateClient } from '@forgeops/fluxgate';

const fluxgate = new FluxGateClient({
  baseUrl: 'https://edge.example.com',
  sdkKey: process.env.FLUXGATE_SDK_KEY!, // <clientId>.<apiKey>
});

if (await fluxgate.isEnabled('new-checkout', { targetingKey: 'user-1', country: 'CA' })) {
  // ...
}
```

React:

```tsx
import { FluxGateProvider, useFlag } from '@forgeops/fluxgate-react';

<FluxGateProvider options={{ baseUrl, sdkKey }} context={{ targetingKey: user.id, country: user.country }}>
  <Checkout />
</FluxGateProvider>;

function Checkout() {
  const theme = useFlag('checkout-theme', 'classic');
  return <CheckoutPage theme={theme} />;
}
```

Angular:

```ts
bootstrapApplication(AppComponent, {
  providers: [provideFluxGate({ options: { baseUrl, sdkKey }, context: { targetingKey: userId } })],
});

// in a component
readonly theme = inject(FluxGateService).flag('checkout-theme', 'classic');
```

## SDK keys and clients

Create the client in the FluxGate admin UI (**Clients**). Its SDK key is `<clientId>.<apiKey>`.

- **Servers (Node.js):** use a **Backend** client. Keep its SDK key secret.
- **Browsers (React, Angular):** use a **Web** client and list your app's origins in **Web Origins**.
  The edge serves a Web client only for those origins, with CORS headers. Its SDK key ships to the
  browser, so it should only ever belong to a Web client.

## How evaluation works

- Every evaluation needs a `targetingKey`, the ID that decides the user's bucket in percentage
  splits. In browsers, use the signed-in user's ID, or a random ID stored on the device for
  anonymous visitors.
- Evaluations never throw. On any error they return the default value you pass, with an
  `errorCode`. The default also sets the expected type: a boolean flag read with a string default
  is a `TYPE_MISMATCH`.
- A flag that is disabled or not deployed for the client's environment answers `false` with no
  variant, whatever its type. For non-boolean reads that yields your default value.
- `FluxGateClient.evaluate` makes one OFREP call per flag and context, cached for 30 s.
  `FlagSnapshot` (used by the React and Angular adapters and the web OpenFeature provider) loads all
  flags for one context in one call and polls every 30 s with `If-None-Match`, so an unchanged flag
  set costs a `304`.
- The edge remembers the variant it first served to a targeting key. After you change a flag's
  rules, a user who already got an answer can keep it.

## Building

```bash
pnpm install
pnpm build
pnpm test
```

Node.js 20+ and pnpm 10. CI builds on Node.js 20, 22 and 24, and tests the React adapter against
React 18 and 19.

## Releasing

`.github/workflows/release.yml` publishes all three packages to npm when a GitHub release is
published. The tag sets the version: tag `v1.2.0` publishes `1.2.0`; a prerelease such as
`v1.3.0-beta.1` goes to the `next` dist-tag. Packages in the repository stay on `0.0.0-dev`.

Publishing authenticates in one of two ways, with provenance either way:

- **`NPM_TOKEN` repository secret (current):** a granular npm token that can publish to the
  `forgeops` scope. Node's bundled npm publishes with it.
- **npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (once npm supports this
  repository):** without `NPM_TOKEN`, the workflow publishes through GitHub OIDC. Each package
  already lists this repository and `release.yml` as its Trusted Publisher. npm cannot yet match the
  immutable OIDC subject GitHub gives repositories created after 2026-07-15
  ([npm/cli#9969](https://github.com/npm/cli/issues/9969)); when that is fixed, delete `NPM_TOKEN`.

A re-run of a failed release skips packages whose version is already on npm.

## License

Apache License 2.0
