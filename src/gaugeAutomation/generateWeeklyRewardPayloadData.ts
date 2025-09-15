import * as core from '@actions/core';
import { createPublicClient, formatEther, http, parseEther } from 'viem';
import { sonic } from 'viem/chains';
import GaugeAbi from '../abi/GaugeAbi';
import { getGaugesForPools } from '../helpers/utils';
import { BEETS_ADDRESS, FRAGMENTS_ADDRESS, LM_GAUGE_MSIG, STS_ADDRESS } from '../helpers/constants';
import { readGaugeDataFromGoogleSheet } from '../helpers/googleSheetHelper';
import { AddRewardTxnInput, createTxnBatchForWeeklyRewards } from '../helpers/safeCreateJsonBatch';
import { generateWeeklyRewardCSV, PayloadDataRow } from '../helpers/csvHelper';

async function run(): Promise<void> {
    try {
        const gaugeData = await readGaugeDataFromGoogleSheet();

        // get gauge addresses
        const poolData = await getGaugesForPools(gaugeData.map((gauge) => gauge.poolId));

        const roundInputs: AddRewardTxnInput[] = [];
        const csvData: PayloadDataRow[] = [];

        let totalGaugeBeetsAmount = 0n;
        let totalMDBeetsAmount = 0n;
        let totalStSRewardsAmount = 0n;
        let totalStSRewardsFromSeasonsAmount = 0n;
        let totalFragmentsRewardsAmount = 0n;

        for (const gauge of gaugeData) {
            const pool = poolData.find((pool) => pool.id === gauge.poolId.toLowerCase());
            if (!pool?.staking) {
                core.setFailed(`Pool ${gauge.poolId} has no gauge`);
                return;
            }

            totalGaugeBeetsAmount += parseEther(gauge.gaugeBeets);
            totalMDBeetsAmount += parseEther(gauge.extraBeets);
            totalStSRewardsAmount += parseEther(gauge.extraStSRewards);
            totalStSRewardsFromSeasonsAmount += parseEther(gauge.sitmiRewards);
            totalFragmentsRewardsAmount += parseEther(gauge.fragmentsRewards);

            const beetsAmount = parseEther(gauge.gaugeBeets) + parseEther(gauge.extraBeets);
            const stSAmount = parseEther(gauge.extraStSRewards) + parseEther(gauge.sitmiRewards);
            const fragmentsAmount = parseEther(gauge.fragmentsRewards);

            const roundInput: AddRewardTxnInput = {
                gaugeAddress: pool.staking.gauge.gaugeAddress,
                beetsAmountInWei: beetsAmount,
                addBeetsRewardToken: true,
                stSAmountInWei: stSAmount,
                addStSRewardToken: stSAmount > 0n,
                fragmentsAmountInWei: fragmentsAmount,
                addFragmentsRewardToken: fragmentsAmount > 0n,
            };

            roundInputs.push(roundInput);

            // Initialize CSV row
            const csvRow: PayloadDataRow = {
                poolId: gauge.poolId,
                poolTokenName: gauge.poolTokenName,
                gaugeAddress: pool.staking.gauge.gaugeAddress,
                beetsAmount: formatEther(beetsAmount),
                stSAmount: formatEther(stSAmount),
                fragmentsAmount: formatEther(fragmentsAmount),
                addBeetsRewardToken: true,
                addStSRewardToken: stSAmount > 0n,
                addFragmentsRewardToken: fragmentsAmount > 0n,
                hasWrongDistributor: false,
            };

            csvData.push(csvRow);
        }

        const viemClient = createPublicClient({ chain: sonic, transport: http() });

        let hasWrongDistributor = false;

        // Check existing reward tokens and distributors
        for (let i = 0; i < roundInputs.length; i++) {
            const input = roundInputs[i];
            const csvRow = csvData[i];

            const rewardsTokenCount = await viemClient.readContract({
                address: input.gaugeAddress as `0x${string}`,
                abi: GaugeAbi,
                functionName: 'reward_count',
            });

            for (let j = 0; j < Number(rewardsTokenCount); j++) {
                const rewardToken = await viemClient.readContract({
                    address: input.gaugeAddress as `0x${string}`,
                    abi: GaugeAbi,
                    functionName: 'reward_tokens',
                    args: [BigInt(j)],
                });

                if (rewardToken.toLowerCase() === BEETS_ADDRESS.toLowerCase()) {
                    input.addBeetsRewardToken = false;
                    csvRow.addBeetsRewardToken = false;

                    const rewardData = await viemClient.readContract({
                        address: input.gaugeAddress as `0x${string}`,
                        abi: GaugeAbi,
                        functionName: 'reward_data',
                        args: [rewardToken],
                    });

                    if (rewardData.distributor.toLowerCase() !== LM_GAUGE_MSIG.toLowerCase()) {
                        hasWrongDistributor = true;
                        csvRow.hasWrongDistributor = true;
                        console.log(
                            `Gauge ${input.gaugeAddress} has wrong distributor for beets rewards: ${rewardData.distributor}`,
                        );
                    }
                }

                if (rewardToken.toLowerCase() === STS_ADDRESS.toLowerCase()) {
                    input.addStSRewardToken = false;
                    csvRow.addStSRewardToken = false;

                    const rewardData = await viemClient.readContract({
                        address: input.gaugeAddress as `0x${string}`,
                        abi: GaugeAbi,
                        functionName: 'reward_data',
                        args: [rewardToken],
                    });

                    if (rewardData.distributor.toLowerCase() !== LM_GAUGE_MSIG.toLowerCase()) {
                        hasWrongDistributor = true;
                        csvRow.hasWrongDistributor = true;
                        console.log(
                            `Gauge ${input.gaugeAddress} has wrong distributor for stS rewards: ${rewardData.distributor}`,
                        );
                    }
                }

                if (rewardToken.toLowerCase() === FRAGMENTS_ADDRESS.toLowerCase()) {
                    input.addFragmentsRewardToken = false;
                    csvRow.addFragmentsRewardToken = false;

                    const rewardData = await viemClient.readContract({
                        address: input.gaugeAddress as `0x${string}`,
                        abi: GaugeAbi,
                        functionName: 'reward_data',
                        args: [rewardToken],
                    });

                    if (rewardData.distributor.toLowerCase() !== LM_GAUGE_MSIG.toLowerCase()) {
                        hasWrongDistributor = true;
                        csvRow.hasWrongDistributor = true;
                        console.log(
                            `Gauge ${input.gaugeAddress} has wrong distributor for fragments rewards: ${rewardData.distributor}`,
                        );
                    }
                }
            }
        }

        // Log summary
        console.log(`Total Beets from gauges: ${formatEther(totalGaugeBeetsAmount)}`);
        console.log(`Total Beets from MD: ${formatEther(totalMDBeetsAmount)}`);
        console.log(`Total Beets: ${formatEther(totalGaugeBeetsAmount + totalMDBeetsAmount)}`);
        console.log(`Total StS rewards: ${formatEther(totalStSRewardsAmount)}`);
        console.log(`Total StS rewards from seasons: ${formatEther(totalStSRewardsFromSeasonsAmount)}`);
        console.log(`Total Fragments rewards: ${formatEther(totalFragmentsRewardsAmount)}`);

        await generateWeeklyRewardCSV(csvData);

        // create txn payload nevertheless
        await createTxnBatchForWeeklyRewards(roundInputs);

        if (hasWrongDistributor) {
            core.setFailed('Some gauges have wrong distributor.');
            return;
        }

        console.log('Payload data generation completed successfully!');
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
