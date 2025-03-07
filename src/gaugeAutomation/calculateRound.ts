import * as core from '@actions/core';
import * as fs from 'fs';
import { formatEther, parseEther, parseUnits } from 'viem';
import { GaugeData, SnapshotProposal } from '../helpers/utils';
import { SNAPSHOT_HUB_URL } from '../helpers/constants';

async function run(): Promise<void> {
    try {
        const endTime = process.env.VOTE_END_TIMESTAMP;
        if (!endTime) {
            core.setFailed('Missing required environment variable VOTE_END_TIMESTAMP');
            return;
        }

        const gaugeDataForEndTime: GaugeData = JSON.parse(
            fs.readFileSync(`./src/gaugeAutomation/gauge-data/${endTime}.json`, 'utf-8'),
        ) as GaugeData;

        // Get result from snapshot
        const query = `{
        proposals(where: {space: "beets-gauges.eth", title_contains: "Gauge", end: ${endTime}}, first: 1) {
            id
            end
            snapshot
            strategies{
                name
                params
            }
            choices
            scores
            }
        }`;

        const snapshotGraphUrl = SNAPSHOT_HUB_URL + '/graphql';

        const snapshotResponse = await fetch(snapshotGraphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });
        const voteOutcome = (await snapshotResponse.json()) as { data: { proposals: SnapshotProposal[] } };

        // Calculating beets amount for each pool
        const totalVotes = voteOutcome.data.proposals[0].scores.reduce((acc, score) => acc + score, 0);
        const result = voteOutcome.data.proposals[0].choices.map((choice, index) => {
            const weight =
                voteOutcome.data.proposals[0].scores[index] !== 0
                    ? (voteOutcome.data.proposals[0].scores[index] / totalVotes).toFixed(4)
                    : '0';
            return {
                poolName: choice,
                poolId: gaugeDataForEndTime.gauges.find((gauge) => gauge.poolName === choice)?.poolId,
                gaugeAddress: '',
                beetsAmountWei:
                    (parseEther(gaugeDataForEndTime.beetsToDistribute) * parseUnits(weight, 8)) / parseUnits('1', 8),
            };
        });

        // make sure we have a sum of 100% for weights
        const beetsAmountWei = result.reduce((acc, result) => acc + result.beetsAmountWei, 0n);
        console.log('Total Beets:', beetsAmountWei);
        if (beetsAmountWei > parseEther(gaugeDataForEndTime.beetsToDistribute)) {
            // remove difference from an option
            const diff = parseEther(gaugeDataForEndTime.beetsToDistribute) - beetsAmountWei;
            const maxBeetsAmountWei = Math.max(...result.map((pool) => Number(pool.beetsAmountWei)));
            const maxBeetsAmountWeiIndex = result.findIndex(
                (pool) => Number(pool.beetsAmountWei) === maxBeetsAmountWei,
            );
            result[maxBeetsAmountWeiIndex].beetsAmountWei = result[maxBeetsAmountWeiIndex].beetsAmountWei - diff;
        } else if (beetsAmountWei < parseEther(gaugeDataForEndTime.beetsToDistribute)) {
            // add difference to an option
            const diff = parseEther(gaugeDataForEndTime.beetsToDistribute) - beetsAmountWei;
            const maxBeetsAmountWei = Math.max(...result.map((pool) => Number(pool.beetsAmountWei)));
            const maxBeetsAmountWeiIndex = result.findIndex(
                (pool) => Number(pool.beetsAmountWei) === maxBeetsAmountWei,
            );
            result[maxBeetsAmountWeiIndex].beetsAmountWei = result[maxBeetsAmountWeiIndex].beetsAmountWei + diff;
        }

        const beetsAmountWeiAfterAdjustment = result.reduce((acc, result) => (acc += result.beetsAmountWei), 0n);
        console.log('Total Beets after adjustment:', beetsAmountWeiAfterAdjustment);
        if (beetsAmountWeiAfterAdjustment !== parseEther(gaugeDataForEndTime.beetsToDistribute)) {
            core.setFailed('Total weight after adjustment is not 1');
            return;
        }

        for (const gauge of gaugeDataForEndTime.gauges) {
            const pool = result.find((pool) => pool.poolId === gauge.poolId);
            if (!pool) {
                core.setFailed(`Pool ${gauge.poolId} not present in result for gaugeData`);
                return;
            }
            gauge.weeklyBeetsAmountFromGauge = formatEther(pool.beetsAmountWei / 2n);
        }

        fs.writeFileSync(
            `./src/gaugeAutomation/gauge-data/${gaugeDataForEndTime.endTimestamp}.json`,
            JSON.stringify(gaugeDataForEndTime, null, 2),
        );
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
