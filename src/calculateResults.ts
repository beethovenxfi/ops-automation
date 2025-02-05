import * as core from '@actions/core';
import moment from 'moment';
import * as fs from 'fs';
import { createPublicClient, http } from 'viem';
import { sonic } from 'viem/chains';
import GaugeAbi from './abi/GaugeAbi';
import { AddBeetsRewardTxnInput, createTxnBatchForBeetsRewards } from './helpers/createSafeTransaction';

const SONIC_RPC_URL = 'https://rpc.soniclabs.com';
export const BEETS_ADDRESS = '0x2d0e0814e62d80056181f5cd932274405966e4f0';

const manualGauges = [
    '0x8476F3A8DA52092e7835167AFe27835dC171C133',
    '0xf6a0071f5607f589DF253E0991Ba6aBdDE7a6d32',
    '0xa472438718Fe7785107fCbE584d39183a6420D36',
    '0x61F511B0D26ac5536034FB1BF024F29D8F04e2Cb',
    '0x9c77e08A47452d3111c68d315535BB64491282E3',
    '0x635A06104346B0D8b95039E1E82511eF681937A4',
    '0xbDF360F9339b961f45fAd6dB1aAF2229e68d3E43',
    '0xb3Bf2c247A599DFcEf06791b1668Fe9456677923',
    '0x96da02749d9504638f6F4072dae63B5e2302501E',
    '0xcFef8FA4A81a1649bcC91bb0C180Af30eB4FD042',
    '0x1daC1645D2492F231E5EAdC6a346d3C7cb68a694',
    '0xAC56282bA2167C11f17118e62E4f860179117a7c',
    '0xFCA28e262590D001552B0AF20dBA1380148C9332',
    '0x5D9e8B588F1D9e28ea1963681180d8b5938D26BA',
    '0xFa6027d781FcEb4C1A6D29744F41BcaD77fB8DC9',
    '0x33B29bcf17e866A35941e07CbAd54f1807B337f5',
    '0x919a67110d2E3B506209888bedf4b16387107FBE',
    '0x1d56C3d07A960E20a57b4Ad0c5cce4c7d78e7093',
    '0xFb485Ae2eA222a3f45f372C8B479b1D16e2cD631',
];

const manualAmounts = [
    94002, 39819, 22145, 10504, 9130, 7672, 6631, 4734, 2644, 2602, 2219, 2079, 1984, 1566, 1397, 458, 264, 84, 66,
];

const manualRoundId = 1738612800;

async function run(): Promise<void> {
    // get results from snapshot
    // calc per pool emissions
    // get gauge addresses

    const roundOneInputs: AddBeetsRewardTxnInput[] = manualGauges.map((gauge, index) => {
        return {
            gaugeAddress: gauge,
            beetsAmount: manualAmounts[index].toString(),
            addRewardToken: true,
        };
    });

    try {
        const viemClient = createPublicClient({ chain: sonic, transport: http() });

        // checking if all gauges have beets as reward token
        for (const input of roundOneInputs) {
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
            if (input.addRewardToken) {
                console.log(`Need to add beets as reward token to gauge ${input.gaugeAddress}`);
            }
        }

        // build list of txns
        createTxnBatchForBeetsRewards(manualRoundId, roundOneInputs);
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
