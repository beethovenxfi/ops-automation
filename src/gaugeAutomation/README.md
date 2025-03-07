# Gauge vote automation

## How to

### Start a new voting round

1. Adapt [choices-init.json](./gauge-choices/choices-init.json) and merge to main:
   This file maps pool names to pool IDs and needs to be manually updated. Pools in this file will be added as voting options to the snapshot vote. The
   pool names can be arbitrary and do not need to be the real pool names. The names will be used as a snapshot vote option only.
2. Get snapshot initializing data:
    1. Amount of Beets to be distributed for the gauge vote (in human readable)
    2. Start day of the vote in this format: YYYY-MM-DD (Usually a Thursday)
    3. End day of the vote in this format: YYYY-MM-DD (Usually a Monday)
    4. The block number of the snapshot block (Usually Wednesday 00:00 UTC)
3. Run the action `Start new voting epoch and create snapshot` and use above data as input. This will automatically:
    1. Create a new file under [gauge-data](./gauge-data/) using the vote end timestamp as filename. The file contains information about the gauge vote such as: Beets to distribute, timestamps, snapshot block and pools that are options in the gauge vote. This file is being used to determine Beets allocations in the end step.
    2. Create a snapshot vote using the choices provided under [choices-init.json](./gauge-choices/choices-init.json) and the input given

### Create missing gauges

Pools need to have a gauge before we can end a voting round. Run the action `Create missing gauges for pools` to create gauges for all pools for a given end timestamp. It will read the corresponding file in in [gauge-data/](./gauge-data/) and create a gauge if any gauge doesnt have one.

### Calculate voting results

1. Adapt [gauge-data](./gauge-data/) for the voting round you want to calculate and add any MD allocation you want to add to any pools. **All amounts are for ONE week, half an epoch.** This needs to be merged to main.
2. Run the `Calculate voting results` action and supply the end timestamp of the vote you want to analyze. This will:
    1. Fetch snapshots results for the given vote
    2. Calculate Beets sent to the gauges based on votes and the given MD allocation
    3. Update the [gauge-data](./gauge-data/) vote round file with the calculated amounts. **All amounts are for ONE week, half an epoch.**

### Generate payload

**Make sure all pools have a gauge. If you just ran the `Create missing gauges for pools` action, you need to wait for 15mins for the API to sync.**

This needs to be adapted and run every week.

1. Adapt [gauge-data](./gauge-data/) for the voting round you want to calculate and add any MD allocation you want to add to any pools.
2. Run the `Generate payload for a week of rewards` action and supply the end timestamp of the vote you want to analyze. This will:
    1. Add/Update two batch transactions
        1. add-reward-token-{timestamp}.json: Transactions that will add BEETS to all gauges that dont have BEETS added as a reward token, if any.
        2. deposit-beets-{timestamp}.json: Transactions that will approve and send ONE WEEK (half an epoch) worth of BEETS to the given gauges.
