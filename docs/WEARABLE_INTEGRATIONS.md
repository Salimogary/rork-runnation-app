# Wearable Integrations

RunNation includes an inactive integration shell for Health Connect and Garmin.
Version 1.0.1 does not request health permissions, start OAuth, or sync provider data.

## Current state

- Provider cards are visible as `Coming soon` in Settings and Workout sources.
- `wearable_provider_config` controls provider availability.
- `wearable_connections` stores per-user connection state and reserved encrypted credentials.
- `wearable_sync_records` provides provider-record deduplication and import auditing.
- `wearables.getProviders` returns provider readiness and connection state.
- `wearables.startConnection` refuses authorization until a provider is explicitly enabled.

## Health Connect activation

1. Complete the Google Play Health Apps declaration and Data Safety disclosures.
2. Add the native Health Connect dependency and Expo config plugin.
3. Request only approved record permissions.
4. Normalize exercise records into `activities`.
5. Normalize steps, heart rate, sleep, and oxygen saturation into `health_goal`.
6. Store the Health Connect record ID in `wearable_sync_records.provider_record_id`.
7. Enable background or historical reads only after the matching declaration is approved.
8. Set `health_connect` to `available` and `is_enabled = true`.

## Garmin activation

1. Obtain Garmin developer approval and API credentials.
2. Add backend OAuth start and callback routes.
3. Encrypt access and refresh tokens before storage.
4. Configure Garmin activity and health webhook ingestion.
5. Normalize incoming records and deduplicate by Garmin activity or summary ID.
6. Keep event-credit imports in review until anti-cheat rules are finalized.
7. Set `garmin` to `available` and `is_enabled = true`.

Do not store plaintext provider tokens or raw health payloads unless they are required
for support or audit and covered by the published privacy policy.
