import * as core from '@actions/core';
import * as fs from 'fs';
import { createPublicClient, http, parseEther } from 'viem';
import { sonic } from 'viem/chains';
import GaugeAbi from '../abi/GaugeAbi';
import { AddBeetsRewardTxnInput, createTxnBatchForBeetsRewards } from '../helpers/createSafeTransaction';
import { GaugeData, getGaugesForPools } from '../helpers/utils';
import { BEETS_ADDRESS } from '../helpers/constants';

async function run(): Promise<void> {
    const endTime = process.env.VOTE_END_TIMESTAMP;
    if (!endTime) {
        core.setFailed('Missing required environment variable VOTE_END_TIMESTAMP');
        return;
    }

    try {
        const gaugeDataForEndTime: GaugeData = JSON.parse(
            fs.readFileSync(`./gaugeAutomation/gauge-data/${endTime}.json`, 'utf-8'),
        ) as GaugeData;

        // get gauge addresses
        const poolData = await getGaugesForPools(gaugeDataForEndTime.gauges.map((gauge) => gauge.poolId));

        const roundInputs: AddBeetsRewardTxnInput[] = [];

        for (const gauge of gaugeDataForEndTime.gauges) {
            const pool = poolData.find((pool) => pool.id === gauge.poolId);
            if (!pool?.staking) {
                core.setFailed(`Pool ${gauge.poolId} has no gauge`);
                return;
            }

            roundInputs.push({
                gaugeAddress: pool.staking.gauge.gaugeAddress,
                beetsAmountInWei:
                    parseEther(gauge.weeklyBeetsAmountFromGauge) + parseEther(gauge.weeklyBeetsAmountFromMD),
                addRewardToken: true, // default to true for now
            });
        }
        const viemClient = createPublicClient({ chain: sonic, transport: http() });

        // checking if all gauges have beets as reward token
        for (const input of roundInputs) {
            const rewardsTokenCount = await viemClient.readContract({
                address: input.gaugeAddress as `0x${string}`,
                abi: GaugeAbi,
                functionName: 'reward_count',
            });

            for (let i = 0; i < Number(rewardsTokenCount); i++) {
                const rewardToken = await viemClient.readContract({
                    address: input.gaugeAddress as `0x${string}`,
                    abi: GaugeAbi,
                    functionName: 'reward_tokens',
                    args: [BigInt(i)],
                });

                if (rewardToken.toLowerCase() === BEETS_ADDRESS.toLowerCase()) {
                    input.addRewardToken = false;
                    break;
                }
            }
        }

        // build list of txns
        createTxnBatchForBeetsRewards(gaugeDataForEndTime.endTimestamp, roundInputs);
        fs.writeFileSync(
            `./gaugeAutomation/gauge-data/${gaugeDataForEndTime.endTimestamp}.json`,
            JSON.stringify(gaugeDataForEndTime),
        );
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
