# Protocol fees per pool

Calculates the protocol fees Beets captured from a set of Balancer v2 / v3 pools on Sonic over a period, in USD, and each pool's share of the total. Used to distribute protocol fees to pools based on performance.

## How to

1. Put the pool ids into column A of the `Pool Fees` tab of the google sheet (one per row, starting at A2). v2 pools use the 32-byte pool id, v3 pools use the pool address.
2. Run the action `Fee - 3 - Calculate protocol fees per pool` with:
    1. `start_date`: first day of the period (YYYY-MM-DD, UTC, inclusive)
    2. `end_date`: day after the last day of the period (YYYY-MM-DD, UTC, exclusive). For a Monday..Sunday week use the two Mondays.
3. The action will:
    1. Read the pool ids from the sheet
    2. Calculate the fees withdrawn per pool in the period (see below)
    3. Write `Fee in USD` (column E) and `Percentage of contribution` (column F, 0-100) next to each pool id in the sheet. `Pool Address` (B), `Pool Name` (C) and `Token Name` (D) are filled only where empty, existing values are kept.
    4. Open a PR with the full data under [data/](./data/) in a `<start>_<end>` folder: `report.md`, `summary.csv`, `events.csv` (every withdrawal with block, tx, token, amount, price) and `result.json`

The report is also shown in the job summary of the action run.

## How fees are measured

Protocol fees are counted when **Mimic withdraws them** from the fee collector / fee controller, which is right before they are sold down to BEETS and USDC. Each withdrawal is attributed to the pool it came from, priced in USD **at the withdrawal block**, and belongs to the period in which it happened.

| Pool type                 | Event used                                                                | Notes                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Balancer v2 (weighted, stable, Gyro ECLP, ...) | BPT `Transfer(ProtocolFeesCollector -> Mimic)` on the pool contract | v2 pools pay protocol fees as BPT, so the collector's BPT balance is pool-specific. Priced at the pool's share price at that block (`Vault.getPoolTokens` + supply, token prices at that time). |
| Balancer v3               | `ProtocolFeeController.ProtocolFeesWithdrawn(pool, token, recipient, amount)` | Emitted by `withdrawProtocolFees`. Swap and yield fees are combined at this point.                                                                                           |
| Balancer v2 legacy pools paying fees in pool tokens | `Vault.PoolBalanceChanged.protocolFeeAmounts`                  | Not pool-attributable once in the collector. Only flagged as a warning if it occurs (none for current Beets pools).                                                          |

Prices: DefiLlama coins API at the withdrawal timestamp (nearest price, max 6h away). BPTs are valued from on-chain pool state at that block (balances / supply, constituents priced the same way); ERC4626 wrappers are unwrapped via `convertToAssets` at that block. Tokens that cannot be priced are listed under warnings and excluded from USD totals (their amounts still appear in `events.csv`).

This differs from the Dune dashboard [Beets Weekly Protocol Fees by Pool](https://dune.com/queries/4869366/8063675), which counts fees at *collection* time with daily-average prices. Over long windows both agree (v2 pools within 0.5% over 9 months), week by week they differ because withdrawals lag collection (v2 BPT every 2-4 days) and because withdrawals can pause: v3 withdrawals were paused 2026-04-21 .. 2026-09-24 and the whole backlog shows up in the week of 2026-09-24.

## Local run

```bash
START_DATE=2026-10-12 END_DATE=2026-10-19 POOL_IDS=0x75b000584a7d86fb3ef5e15ba26f4c52b41be0e9,0x3849ad7f879f8b8f5f41807dc2a6940765d8f14e000200000000000000000120 bun ts-node ./src/protocolFees/calculateProtocolFees.ts
```

`POOL_IDS` overrides the sheet. Without `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` the sheet is not written. `SONIC_RPC_URL` overrides the RPC (needs archive state and wide `eth_getLogs` ranges, the public `rpc.soniclabs.com` works).
