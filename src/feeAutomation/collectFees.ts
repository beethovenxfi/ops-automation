import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, publicActions } from 'viem';
import { sonic } from 'viem/chains';
import ProtocolFeeController from '../abi/ProtocolFeeController';
import { getV3PoolIds } from '../helpers/utils';
import * as core from '@actions/core';

async function run(): Promise<void> {
    try {
        const poolIds = await getV3PoolIds();

        const key = process.env.UPDATER_WALLET! as `0x${string}`;
        const account = privateKeyToAccount(key);
        const walletClient = createWalletClient({
            account,
            chain: sonic,
            transport: http(`https://rpc.soniclabs.com`),
        }).extend(publicActions);

        for (const id of poolIds) {
            try {
                const hash = await walletClient.writeContract({
                    address: '0xa731C23D7c95436Baaae9D52782f966E1ed07cc8',
                    abi: ProtocolFeeController,
                    functionName: 'collectAggregateFees',
                    args: [id as `0x${string}`],
                });
                console.log(`Done, hash: ${hash}`);
            } catch (error) {
                console.log(`Error collecting fees for pool ${id}`);
            }
        }
    } catch (error) {
        console.log(`error creating gauges: `, error);
        core.setFailed(error as Error);
    }
}

run();
