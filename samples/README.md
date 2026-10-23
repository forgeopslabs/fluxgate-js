# FluxGate TypeScript SDK samples

Three small apps that evaluate flags against a FluxGate stack running on your machine, and a Docker
Compose file that starts that stack.

| Sample | Shows | Address |
|---|---|---|
| [node-sample](node-sample/) | `FluxGateClient` and the OpenFeature server provider. Prints one evaluation per sample user. | (console) |
| [react-sample](react-sample/) | `FluxGateProvider`, `useIsEnabled`, `useFlagDetails`, `useFluxGateStatus`, and reloading on user switch. | http://localhost:28173 |
| [angular-sample](angular-sample/) | `provideFluxGate`, signals from `FluxGateService`, the `*fgFlag` directive, zoneless change detection. | http://localhost:28174 |

You need Docker, Node.js 20+, pnpm 10, `curl`, `jq` and `openssl`. Run the commands from the
repository root.

## 1. Start a local FluxGate stack

[docker-compose.yml](docker-compose.yml) runs Postgres, the backend, the admin UI and the edge
server on their own ports and volume, so it does not clash with another FluxGate install:

| Service | Address |
|---|---|
| Admin UI | http://localhost:28000 |
| Backend REST API | http://localhost:28080/api/v1 (gRPC on 25051) |
| Edge server | http://localhost:28081 (the samples talk to this) |

```bash
docker compose -f samples/docker-compose.yml up -d
```

On Apple Silicon, use the native images instead of x86 emulation:

```bash
printf 'FLUXGATE_BACKEND_TAG=v1.2.2-arm64\nFLUXGATE_EDGE_TAG=v1.2.2-arm64\n' >> samples/.env
docker compose -f samples/docker-compose.yml up -d
```

## 2. Create the sample data

[setup.sh](setup.sh) sets up the fresh stack through the backend REST API:

- the first admin `sample-admin`, the team **Samples** and the environment **Development**,
- the context keys `country` and `user_tier`,
- a **Backend** client `js-sdk-samples` (Node.js sample and edge server) and a **Web** client
  `js-sdk-web-samples` whose Web Origins are the React and Angular samples' addresses,
- an approval policy and a second user `sample-approver`, because a deployment needs an approver
  other than the requester,
- two flags, with their Development stage requested, approved and deployed:

| Flag | Type | Development rules |
|---|---|---|
| `new-checkout` | Simple (boolean) | `true` when `country` equals `CA`, otherwise off. |
| `checkout-theme` | Contextual, string variants `classic` and `express` | `express` when `country` equals `CA` and `user_tier` equals `plus`; everyone else gets an 80/20 split of `classic` and `express`. |

```bash
samples/setup.sh
```

The script writes both SDK keys (`FLUXGATE_SDK_KEY`, `FLUXGATE_WEB_SDK_KEY`) and the sample users'
passwords to `samples/.env`. The file is git-ignored and never printed. Sign in to the admin UI as
`sample-admin` with the password from that file to look at the flags and change their rules.

## 3. Start the edge server

The edge uses the Backend client, read from `FLUXGATE_SDK_KEY`, as its own identity:

```bash
docker compose -f samples/docker-compose.yml --profile edge up -d edge
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:28081/health
```

`200` means the edge is connected to the backend.

## 4. Run the samples

Build the SDK once:

```bash
pnpm install
pnpm build
```

### Node.js

```bash
pnpm --dir samples/node-sample start
FLUXGATE_FLAG=checkout-theme pnpm --dir samples/node-sample start
```

```text
FluxGateClient, flag 'checkout-theme':
  user-1  CA/plus -> value=express variant=express reason=TARGETING_MATCH
  user-2  US/free -> value=classic variant=classic reason=TARGETING_MATCH
  ...
```

The sample reads `samples/.env`. `FLUXGATE_BASE_URL` (default `http://localhost:28081`) and
`FLUXGATE_FLAG` (default `new-checkout`) override its settings.

### React

```bash
pnpm --dir samples/react-sample dev
```

Open http://localhost:28173 and switch between the sample users. `user-1` (CA, plus) sees the new
checkout and the `express` theme; the others see the classic checkout. Vite exposes only the
`FLUXGATE_WEB_*` values of `samples/.env` to the browser.

### Angular

```bash
pnpm --dir samples/angular-sample start
```

Open http://localhost:28174. `scripts/write-env.mjs` copies the `FLUXGATE_WEB_*` values from
`samples/.env` into a git-ignored `src/environments/fluxgate.generated.ts` before each start or
build.

Both browser samples poll every 5 seconds. Switch `new-checkout` off in the admin UI (or with its
kill switch) and the page follows within a few seconds, without a reload.

## Assignments are sticky

The edge remembers the variant it first served to a targeting key. If you change a flag's rules, a
user who already got an answer can keep it. Use new user IDs to see the new rules.

## Start over

```bash
docker compose -f samples/docker-compose.yml --profile edge down -v
rm samples/.env
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| `error=UNAUTHORIZED` or `401` | Wrong SDK key, or the client was deleted. |
| Browser sample shows `Flags: ERROR` with a network error | The page's origin is not in the Web client's Web Origins, or the edge is not running. |
| `error=FLAG_NOT_FOUND` | No flag with that key in the client's team. |
| `reason=DISABLED` for everyone | The flag's Development stage is not deployed. |
| `setup.sh` fails at `POST /admins` | The stack is not fresh. Start over (see above). |
