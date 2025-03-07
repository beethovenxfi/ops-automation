import * as core from '@actions/core';
import * as fs from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, publicActions } from 'viem';
import { sonic } from 'viem/chains';
import gaugeFactoryAbi from '../abi/GaugeFactoryAbi';
import { GaugeChoice, GaugeData, getGaugesForPools } from '../helpers/utils';
import { GAUGE_FACTORY } from '../helpers/constants';

async function run(): Promise<void> {
    const endTime = process.env.VOTE_END_TIMESTAMP;
    if (!endTime) {
        core.setFailed('Missing required environment variable VOTE_END_TIMESTAMP');
        return;
    }

    try {
        const gaugeData: GaugeData = JSON.parse(
            fs.readFileSync(`./src/gaugeAutomation/gauge-data/${endTime}.json`, 'utf-8'),
        ) as GaugeData;

        const poolData = await getGaugesForPools(gaugeData.gauges.map((gauge) => gauge.poolId.toLowerCase()));

        const key = process.env.UPDATER_WALLET! as `0x${string}`;
        const account = privateKeyToAccount(key);
        const walletClient = createWalletClient({
            account,
            chain: sonic,
            transport: http(`https://rpc.soniclabs.com`),
        }).extend(publicActions);

        for (const pool of poolData) {
            if (!pool.staking) {
                console.log(`No staking for ${pool.name}, creating gauge.`);
                const hash = await walletClient.writeContract({
                    address: GAUGE_FACTORY,
                    abi: gaugeFactoryAbi,
                    functionName: 'create',
                    args: [pool.address as `0x${string}`],
                });
                console.log(`Done, hash: ${hash}`);
            }
        }
    } catch (error) {
        console.log(`error creating gauges: `, error);
        core.setFailed(error as Error);
    }
}

run();
