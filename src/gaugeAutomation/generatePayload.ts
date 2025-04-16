import * as core from '@actions/core';
import * as fs from 'fs';
import { createPublicClient, formatEther, http, parseEther } from 'viem';
import { sonic } from 'viem/chains';
import GaugeAbi from '../abi/GaugeAbi';
import { AddRewardTxnInput, createTxnBatchForBeetsRewards } from '../helpers/createSafeTransaction';
import { GaugeData, getGaugesForPools } from '../helpers/utils';
import { BEETS_ADDRESS, FRAGMENTS_ADDRESS, LM_GAUGE_MSIG, STS_ADDRESS } from '../helpers/constants';

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

        const roundInputs: AddRewardTxnInput[] = [];

        let totalGaugeBeetsAmount = 0n;
        let totalMDBeetsAmount = 0n;
        let totalStSRewardsAmount = 0n;
        let totalStSRewardsFromSeasonsAmount = 0n;
        let totalFragmentsRewardsAmount = 0n;

        for (const gauge of gaugeDataForEndTime.gauges) {
            const pool = poolData.find((pool) => pool.id === gauge.poolId.toLowerCase());
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
                addBeetsRewardToken: true, // always add if not already added
                stSAmountInWei: parseEther(gauge.weeklyStSRewards) + parseEther(gauge.weeklyStSRewardsFromSeasons),
                addStSRewardToken:
                    parseEther(gauge.weeklyStSRewards) + parseEther(gauge.weeklyStSRewardsFromSeasons) > 0n, // only add if there are sts rewards
                fragmentsAmountInWei: parseEther(gauge.weeklyFragmentsRewards),
                addFragmentsRewardToken: parseEther(gauge.weeklyFragmentsRewards) > 0n, // only add if there are fragments rewards
            });
        }
        const viemClient = createPublicClient({ chain: sonic, transport: http() });

        let hasWrongDistributor = false;

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

                    const rewardData = await viemClient.readContract({
                        address: input.gaugeAddress as `0x${string}`,
                        abi: GaugeAbi,
                        functionName: 'reward_data',
                        args: [rewardToken],
                    });
                    if (rewardData.distributor.toLowerCase() !== LM_GAUGE_MSIG.toLowerCase()) {
                        hasWrongDistributor = true;
                        console.log(
                            `Gauge ${input.gaugeAddress} has wrong distributor for beets rewards: ${rewardData.distributor}`,
                        );
                    }
                }
                if (rewardToken.toLowerCase() === STS_ADDRESS.toLowerCase()) {
                    input.addStSRewardToken = false;
                    const rewardData = await viemClient.readContract({
                        address: input.gaugeAddress as `0x${string}`,
                        abi: GaugeAbi,
                        functionName: 'reward_data',
                        args: [rewardToken],
                    });
                    if (rewardData.distributor.toLowerCase() !== LM_GAUGE_MSIG.toLowerCase()) {
                        hasWrongDistributor = true;
                        console.log(
                            `Gauge ${input.gaugeAddress} has wrong distributor for stS rewards: ${rewardData.distributor}`,
                        );
                    }
                }
                if (rewardToken.toLowerCase() === FRAGMENTS_ADDRESS.toLowerCase()) {
                    input.addFragmentsRewardToken = false;

                    const rewardData = await viemClient.readContract({
                        address: input.gaugeAddress as `0x${string}`,
                        abi: GaugeAbi,
                        functionName: 'reward_data',
                        args: [rewardToken],
                    });
                    if (rewardData.distributor.toLowerCase() !== LM_GAUGE_MSIG.toLowerCase()) {
                        hasWrongDistributor = true;
                        console.log(
                            `Gauge ${input.gaugeAddress} has wrong distributor for fragments rewards: ${rewardData.distributor}`,
                        );
                    }
                }
            }
        }

        if (hasWrongDistributor) {
            core.setFailed('Some gauges have wrong distributor for beets rewards, failing. Please check logs.');
            return;
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
