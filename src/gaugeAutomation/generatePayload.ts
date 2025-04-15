import * as core from '@actions/core';
import * as fs from 'fs';
import { createPublicClient, formatEther, http, parseEther } from 'viem';
import { sonic } from 'viem/chains';
import GaugeAbi from '../abi/GaugeAbi';
import { AddBeetsRewardTxnInput, createTxnBatchForBeetsRewards } from '../helpers/createSafeTransaction';
import { GaugeData, getGaugesForPools } from '../helpers/utils';
import { BEETS_ADDRESS, FRAGMENTS_ADDRESS, STS_ADDRESS } from '../helpers/constants';

async function run(): Promise<void> {
    const endTime = process.env.VOTE_END_TIMESTAMP;
    if (!endTime) {
        core.setFailed('Missing required environment variable VOTE_END_TIMESTAMP');
        return;
    }

    try {
        const gaugeDataForEndTime: GaugeData = JSON.parse(
            fs.readFileSync(`./src/gaugeAutomation/gauge-data/${endTime}.json`, 'utf-8'),
        ) as GaugeData;

        // get gauge addresses
        const poolData = await getGaugesForPools(gaugeDataForEndTime.gauges.map((gauge) => gauge.poolId));

        const roundInputs: AddBeetsRewardTxnInput[] = [];

        let totalGaugeBeetsAmount = 0n;
        let totalMDBeetsAmount = 0n;
        let totalStSRewardsAmount = 0n;
        let totalStSRewardsFromSeasonsAmount = 0n;
        let totalFragmentsRewardsAmount = 0n;

        for (const gauge of gaugeDataForEndTime.gauges) {
            const pool = poolData.find((pool) => pool.id === gauge.poolId);
            if (!pool?.staking) {
                core.setFailed(`Pool ${gauge.poolId} has no gauge`);
                return;
            }

            totalGaugeBeetsAmount += parseEther(gauge.weeklyBeetsAmountFromGauge);
            totalMDBeetsAmount += parseEther(gauge.weeklyBeetsAmountFromMD);
            totalStSRewardsAmount += parseEther(gauge.weeklyStSRewards);
            totalStSRewardsFromSeasonsAmount += parseEther(gauge.weeklyStSRewardsFromSeasons);
            totalFragmentsRewardsAmount += parseEther(gauge.weeklyFragmentsRewards);

            roundInputs.push({
                gaugeAddress: pool.staking.gauge.gaugeAddress,
                beetsAmountInWei:
                    parseEther(gauge.weeklyBeetsAmountFromGauge) + parseEther(gauge.weeklyBeetsAmountFromMD),
                addBeetsRewardToken: true, // default to true, will override after checking if gauge has beets as reward token
                addStSRewardToken: true, // default to true, will override after checking if gauge has beets as reward token
                addFragmentsRewardToken: true, // default to true, will override after checking if gauge has beets as reward token
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
                    input.addBeetsRewardToken = false;
                }
                if (rewardToken.toLowerCase() === STS_ADDRESS.toLowerCase()) {
                    input.addStSRewardToken = false;
                }
                if (rewardToken.toLowerCase() === FRAGMENTS_ADDRESS.toLowerCase()) {
                    input.addFragmentsRewardToken = false;
                }
            }
        }

        console.log(`Creating payload for ${endTime}`);
        console.log(`Total Beets from gauges: ${formatEther(totalGaugeBeetsAmount)}`);
        console.log(`Total Beets from MD: ${formatEther(totalMDBeetsAmount)}`);
        console.log(`Total Beets: ${formatEther(totalGaugeBeetsAmount + totalMDBeetsAmount)}`);
        console.log(`Total StS rewards: ${formatEther(totalStSRewardsAmount)}`);
        console.log(`Total StS rewards from seasons: ${formatEther(totalStSRewardsFromSeasonsAmount)}`);
        console.log(`Total Fragments rewards: ${formatEther(totalFragmentsRewardsAmount)}`);

        // build list of txns
        createTxnBatchForBeetsRewards(gaugeDataForEndTime.endTimestamp, roundInputs);
        fs.writeFileSync(
            `./src/gaugeAutomation/gauge-data/${gaugeDataForEndTime.endTimestamp}.json`,
            JSON.stringify(gaugeDataForEndTime, null, 2),
        );
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
