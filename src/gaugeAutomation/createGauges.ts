import * as core from '@actions/core';
import * as fs from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, publicActions } from 'viem';
import { sonic } from 'viem/chains';
import gaugeFactoryAbi from '../abi/GaugeFactoryAbi';
import { GaugeData, getGaugesForPools } from '../helpers/utils';
import { GAUGE_FACTORY } from '../helpers/constants';
import { readGaugeDataFromGoogleSheet } from '../helpers/googleSheetHelper';

async function run(): Promise<void> {
    try {
        const rows = await readGaugeDataFromGoogleSheet();

        const poolData = await getGaugesForPools(rows.map((gauge) => gauge.poolId.toLowerCase()));

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
