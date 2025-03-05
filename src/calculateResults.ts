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
    '0xa472438718Fe7785107fCbE584d39183a6420D36',
    '0xf6a0071f5607f589DF253E0991Ba6aBdDE7a6d32',
    '0x0c7f2B3503FF6703bEaccbfa028c52CcDC10f61e',
    '0x5D9e8B588F1D9e28ea1963681180d8b5938D26BA',
    '0x9c77e08A47452d3111c68d315535BB64491282E3',
    '0xbDF360F9339b961f45fAd6dB1aAF2229e68d3E43',
    '0xb3Bf2c247A599DFcEf06791b1668Fe9456677923',
    '0x96da02749d9504638f6F4072dae63B5e2302501E',
    '0xB6F5702b0dA321A38a2a43A31ebe4b05183A85d5',
    '0x61F511B0D26ac5536034FB1BF024F29D8F04e2Cb',
    '0xb0406A4e9bA2A7932EC537AE44128230BE305768',
    '0x33B29bcf17e866A35941e07CbAd54f1807B337f5',
    '0xcFef8FA4A81a1649bcC91bb0C180Af30eB4FD042',
    '0x1daC1645D2492F231E5EAdC6a346d3C7cb68a694',
    '0xAC56282bA2167C11f17118e62E4f860179117a7c',
    '0x5abB779d377F213ad6b2477200B582924E9FDf07',
    '0x6b913C7915479ab4f409f209f73ce44e467366AC',
    '0xFa6027d781FcEb4C1A6D29744F41BcaD77fB8DC9',
    '0x232C81fb683b830f2AA8457f88a7ceD78Ef956aC',
    '0x8828a6e3166cac78F3C90A5b5bf17618BDAf1Deb',
    '0xC216ff0c4D9E030330958e6A6D6d5ed8d0B38442',
    '0xD50BA85eF41e8A53F4717e5753015832A700E708',
    '0x83f20A785c63288A0251A8a1cB249294EdCA4084',
    '0xEfF625E5a6619900931f6246E849A03B5B62BE75',
    '0xFCA28e262590D001552B0AF20dBA1380148C9332',
    '0x748e5c88b586172692500f3415678C87842f8d3f',
    '0x919a67110d2E3B506209888bedf4b16387107FBE',
];
const manualAmounts = [
    57855, 32853, 32250, 15087, 11421, 9707, 6747, 5759, 5357, 4596, 4389, 4361, 2518, 2471, 2439, 2146, 1963, 1944,
    1236, 978, 938, 889, 744, 639, 605, 45, 45, 18,
];

const manualRoundId = 1741032000;

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
