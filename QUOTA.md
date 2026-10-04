# Database quota measurements

This change removes repeated writes from presence updates and measures local database work by statement. It does not change the Cloudflare plan or deploy the app.

## Persistence behavior

- `worldOccupancy` still updates the room count and freshness every 10 seconds. It updates a member's `away` column only when the value changes.
- `CommunityCore.lookup` still reads session expiry, privacy consent, and suspension on every call. It touches `profiles.last_active` at most once every five minutes across all sessions, including after a restart. Progress saves still update activity immediately. The inactivity-retention timestamp can therefore lag a read-only request by up to five minutes.
- World authorization and appearance refresh still run every 30 seconds. Position checkpoints save only changed `x`, `z`, `yaw`, `activity`, or `away` values. The first checkpoint after joining remains conservative. Final departure still saves the latest pose unconditionally.
- A checkpoint becomes clean only after Records confirms the save. Socket attachments and poll snapshots retain that acknowledgement across hibernation. A move during a save stays dirty. Legacy attachments without a checkpoint marker receive a fresh checkpoint.
- An idle player's durable `players.seen` now reflects the last changed checkpoint until departure. Live status and room freshness still come from room membership and the 10-second report. The HTTP fallback still persists its poll snapshot so eviction cannot lose its current state.
- Replay retention updates only old runs that still contain a replay. Scores and other run fields remain untouched.

## Read optimization

The score-record aggregate and the wins aggregate now share one pass through finished runs. Verified, eligible, and Coast Rush version rules retain their existing behavior. The differential test compares actual snapshot cards with the old SQL across 60,090 mixed rows.

The 30-second cache lifetime, Singapore day boundaries, settlement, board ordering, ties, and post-query privacy filters are unchanged. Extending cache lifetime needs a separate design: the current refresh also catches presentation changes and time-dependent board cutoffs.

## Before and after

Both five-minute runs used main `646b81a` as the baseline, Node 24.19.0, Wrangler 4.147.0, 150 connected players, 1,000 accounts, and 20,000 historical runs. The after run includes this patch. Profiling was disabled. The complete fixture reports are [before.json](measurements/quota/before.json) and [after.json](measurements/quota/after.json).

| Measurement                      |    Before |     After |
| -------------------------------- | --------: | --------: |
| Records SQL rows written         |    16,898 |    10,891 |
| Records SQL rows read            | 3,358,213 | 3,116,690 |
| SQL executions                   |    48,501 |    46,982 |
| State requests                   |     1,501 |     1,501 |
| World authorization refresh RPCs |        60 |        60 |
| World checkpoint RPCs            |        60 |        60 |
| Occupancy RPCs                   |       180 |       180 |
| Verified rounds                  |         3 |         3 |
| Request errors                   |         0 |         0 |

Writes fell **35.5%** and reads fell **7.2%** in this fixture. The 4,500 unchanged away updates wrote zero rows after the change. The 1,507 activity-only profile updates disappeared. The combined aggregate removed one 240,036-row scan across 12 snapshot rebuilds.

World storage calls were unchanged in this moving-player workload: 60 `put`, 60 `delete`, 180 `getAlarm`, and 180 `setAlarm` calls on each side. Dirty-only checkpoints primarily help idle players; this run deliberately keeps everyone moving. It establishes no CPU or latency improvement.

Five alternating smaller probe pairs each completed six state requests and six directory requests without errors or counter resets. Writes were 37 before and 25 after in every pair. Read medians were 671 before and 659 after, with ranges of 665–671 and 659–659. A preliminary five-minute run on `949c1fd` also matched the final baseline totals.

The 65-second idle runs and 35-second HTTP run triggered the instance-reset guard. Their partial totals are excluded. This verifies that the fixture rejects undercounted measurements when workerd evicts an object.

Read usage remains substantial: boards read 1,104,300 rows, offline-neighbour selection reads 846,624, and abandoned-run housekeeping reads 300,054 in the after run. This PR does not establish that the Free plan can support the earlier 100-player-hour estimate or restore service after an account has exhausted its daily quota.

## Reproduce the measurements

Install the locked dependencies, build, and run the local fixture:

```sh
npm ci
npm run build
npm run load:test -- --players 150 --seconds 300 --mode mixed --profile off
```

The default `mixed` mode preserves the existing fixture: 1,000 synthetic accounts, 20,000 historical runs, five movement messages per second, state reads every 30 seconds, and three replay-verified rounds. The script starts its own local Wrangler process. It rejects remote targets and clears Cloudflare credential environment variables for that process.

Copy the same `scripts/load-test.mjs`, `scripts/load-worker.mjs`, and `scripts/load-metrics.mjs` into a separate checkout of the comparison commit. Run both against fresh disposable persistence. Use different `--port` and `--inspector-port` values if another local process is running.

Additional modes isolate smaller paths:

```sh
# A fixed request sequence; repeat on each revision.
npm run load:test -- --mode probe --players 2 --registered 20 --runs 200 --iterations 3 --profile off

# Transport checks; HTTP uses the browser's two-second fallback interval.
npm run load:test -- --mode moving --players 3 --seconds 35 --profile off
npm run load:test -- --mode http --players 3 --seconds 35 --profile off
npm run load:test -- --mode idle --players 25 --seconds 65 --profile off
```

The final command can fail the measurement guard when idle objects hibernate. Treat that result as incomplete. The fixture deliberately does not prevent hibernation or persist counters to the database to make an idle total appear complete. Deterministic checkpoint lifecycle tests cover idle saves, failed saves, hibernation, poll restart, final departure, session changes, and rejoin.

Each run prints its `.browser/load-*/report.json` path. Counters remain in memory. `records.statements` contains normalized SQL, execution counts, and workerd cursor `rowsRead` and `rowsWritten` after consumption. `records.operations` attributes those counts to requests and RPCs. Values passed to SQL are not recorded.

`worldStorage` separately reports KV and alarm API invocation counts. These can include cache hits and must not be added to SQL cursor rows as if they shared the same billing unit. Seeding, connection setup, the initial state warmup, metrics readback, and teardown are excluded. If a Records or World instance changes during measurement, the report records the reset and exits unsuccessfully.

Fixture IDs and timestamps are randomized. Timed runs can also differ at interval boundaries. Compare request and alarm counts as well as totals. These measurements describe local workerd behavior, not hosted billing, production consumption, or a guarantee that a workload fits the Free plan.

## Regression checks

```sh
npm test
npm run test:cloudflare
```

`npm test` includes SQL write audit triggers, checkpoint lifecycle tests, metric attribution and reset tests, and the snapshot differential test. Cloudflare integration coverage checks unchanged away flags, away transitions, room freshness, real socket hibernation, HTTP fallback, account persistence, session rotation, rate limits, replay verification, and deletion.

The Node suite runs files serially so the 60,090-row differential fixture cannot compete with the existing hard 10 ms cached-state timing budget. The timing limits are unchanged. Run the suite without a separate load generator on the same computer.

The dirty-checkpoint acknowledgement cases use the actual World class with a controlled clock and mocked transport/storage. The existing Cloudflare test exercises real hibernation, but it does not independently repeat every acknowledgement race in workerd. No production gameplay, production quota recovery, or physical-device behavior is established by these checks.
