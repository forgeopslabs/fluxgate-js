/**
 * Evaluates one flag for four sample users, first with FluxGateClient and then
 * through OpenFeature.
 *
 * Settings come from environment variables (samples/.env is loaded):
 *   FLUXGATE_BASE_URL  edge server URL, default http://localhost:28081
 *   FLUXGATE_SDK_KEY   SDK key of a Backend client, <clientId>.<apiKey> (required)
 *   FLUXGATE_FLAG      flag key to evaluate, default new-checkout
 *
 * Exits with status 1 when an evaluation fails.
 */
import { FluxGateClient } from '@forgeops/fluxgate';
import { FluxGateServerProvider } from '@forgeops/fluxgate/openfeature/server';
import { OpenFeature } from '@openfeature/server-sdk';

const baseUrl = process.env.FLUXGATE_BASE_URL || 'http://localhost:28081';
const sdkKey = process.env.FLUXGATE_SDK_KEY;
const flag = process.env.FLUXGATE_FLAG || 'new-checkout';

if (!sdkKey) {
  console.error('Set FLUXGATE_SDK_KEY to the SDK key of a FluxGate Backend client (<clientId>.<apiKey>).');
  process.exit(2);
}

const users = [
  { targetingKey: 'user-1', country: 'CA', user_tier: 'plus' },
  { targetingKey: 'user-2', country: 'US', user_tier: 'free' },
  { targetingKey: 'user-3', country: 'US', user_tier: 'plus' },
  { targetingKey: 'user-4', country: 'DE', user_tier: 'free' },
];

const fluxgate = new FluxGateClient({ baseUrl, sdkKey });
console.log(`Edge ${baseUrl} healthy: ${await fluxgate.isHealthy()}`);
let failed = false;

console.log(`\nFluxGateClient, flag '${flag}':`);
for (const user of users) {
  // A null default accepts any flag type: boolean, string, number or JSON.
  const evaluation = await fluxgate.evaluate(flag, null, user);
  console.log(
    `  ${user.targetingKey.padEnd(7)} ${user.country}/${user.user_tier.padEnd(4)} -> value=${String(evaluation.value)} ` +
      `variant=${evaluation.variant ?? '-'} reason=${evaluation.reason}` +
      (evaluation.errorCode ? ` error=${evaluation.errorCode}` : ''),
  );
  failed ||= evaluation.errorCode !== undefined;
}

await OpenFeature.setProviderAndWait(new FluxGateServerProvider(fluxgate));
const openFeature = OpenFeature.getClient();

console.log(`\nOpenFeature, flag '${flag}':`);
for (const user of users) {
  const details = await openFeature.getObjectDetails(flag, 'default', user);
  console.log(
    `  ${user.targetingKey.padEnd(7)} -> value=${String(details.value)} variant=${details.variant ?? '-'} ` +
      `reason=${details.reason}` +
      (details.errorCode ? ` error=${details.errorCode}` : ''),
  );
  failed ||= details.errorCode !== undefined;
}

await OpenFeature.close();
if (failed) {
  console.error('\nSome evaluations failed. Check FLUXGATE_SDK_KEY, the flag key and the edge logs.');
  process.exit(1);
}
