# Fee collection automation

## Collect fees

This action will collect fees from all v3 pools to the [protocol fee controller](https://sonicscan.org/address/0xa731c23d7c95436baaae9d52782f966e1ed07cc8)

## Create withdraw txn

This action will create transactions to withdraw fees from all v3 pools to the [Revenue Multisig](https://app.safe.global/home?safe=sonic:0x26377CAB961c84F2d7b9d9e36D296a1C1c77C995). The transaction must be loaded into that multisig as well.

## Trigger protocol fees on v2 pools

Scheduled every second Sunday 14:00 UTC (starting 2026-11-15), can also be run manually. Balancer v2 pools only mint their protocol fees (as BPT to the [ProtocolFeesCollector](https://sonicscan.org/address/0xce88686553686DA562CE7Cea497CE749DA109f9F)) on a join or exit, so pools without liquidity changes show 0 fees in the per-pool fee calculation. This action does a proportional exit of **0 BPT** from every v2 pool in the `Pool Fees` tab of the google sheet, which mints the pending fees without moving any funds. The only cost is gas paid by `UPDATER_WALLET` (~190k gas per pool).

Local dry run (simulates only, sends nothing): `DRY_RUN=true UPDATER_WALLET=<key> POOL_IDS=<id>,<id> bun ts-node ./src/feeAutomation/triggerV2ProtocolFees.ts`
