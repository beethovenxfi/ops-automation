import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, encodeAbiParameters, http, parseAbi, parseEventLogs, publicActions } from 'viem';
import { sonic } from 'viem/chains';
import * as core from '@actions/core';
import { PROTOCOL_FEES_COLLECTOR_V2, VAULT_V2 } from '../protocolFees/lib/config';
import { readPoolFeesPoolIdsFromGoogleSheet } from '../helpers/googleSheetHelper';
import { getActiveV2PoolIds } from '../helpers/utils';

// v2 pools only mint their protocol fees (as BPT, to the ProtocolFeesCollector) on a join or exit.
// A proportional exit of 0 BPT (EXACT_BPT_IN_FOR_TOKENS_OUT = 1) triggers that mint without moving any funds,
// so the only cost is gas. Works for weighted v4 and Gyro ECLP pools.
const EXACT_BPT_IN_FOR_TOKENS_OUT = 1n;

const vaultAbi = parseAbi([
    'function getPoolTokens(bytes32 poolId) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)',
    'function exitPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] minAmountsOut, bytes userData, bool toInternalBalance) request)',
]);
const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

const MIN_TVL_USD = 100;

async function getV2PoolIds(): Promise<`0x${string}`[]> {
    // POOL_IDS env is a local-testing override. POOL_SOURCE=api uses all active v2 pools from the beets api,
    // otherwise the pools from the "Pool Fees" tab of the google sheet are used.
    let ids: string[];
    if (process.env.POOL_IDS) {
        ids = process.env.POOL_IDS.split(/[\s,]+/).map((s) => s.trim().toLowerCase());
    } else if (process.env.POOL_SOURCE === 'api') {
        ids = await getActiveV2PoolIds(MIN_TVL_USD);
    } else {
        ids = await readPoolFeesPoolIdsFromGoogleSheet();
    }
    // v2 pool ids are 32 bytes, v3 pools are addresses
    return ids.filter((id) => /^0x[0-9a-f]{64}$/.test(id)) as `0x${string}`[];
}

async function run(): Promise<void> {
    try {
        const poolIds = await getV2PoolIds();
        console.log(`Found ${poolIds.length} v2 pools to trigger protocol fees for`);
        const dryRun = process.env.DRY_RUN === 'true';

        const account = privateKeyToAccount(process.env.UPDATER_WALLET! as `0x${string}`);
        const walletClient = createWalletClient({
            account,
            chain: sonic,
            transport: http(process.env.SONIC_RPC_URL || `https://rpc.soniclabs.com`),
        }).extend(publicActions);

        let failed = 0;
        for (const poolId of poolIds) {
            try {
                const [tokens] = await walletClient.readContract({
                    address: VAULT_V2,
                    abi: vaultAbi,
                    functionName: 'getPoolTokens',
                    args: [poolId],
                });
                const { request } = await walletClient.simulateContract({
                    address: VAULT_V2,
                    abi: vaultAbi,
                    functionName: 'exitPool',
                    args: [
                        poolId,
                        account.address,
                        account.address,
                        {
                            assets: tokens,
                            minAmountsOut: tokens.map(() => 0n),
                            userData: encodeAbiParameters(
                                [{ type: 'uint256' }, { type: 'uint256' }],
                                [EXACT_BPT_IN_FOR_TOKENS_OUT, 0n],
                            ),
                            toInternalBalance: false,
                        },
                    ],
                });
                if (dryRun) {
                    console.log(`[dry run] ${poolId}: exit simulated ok`);
                    continue;
                }

                const hash = await walletClient.writeContract(request);
                const receipt = await walletClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== 'success') throw new Error(`tx ${hash} reverted`);

                const minted = parseEventLogs({ abi: transferAbi, logs: receipt.logs, eventName: 'Transfer' })
                    .filter((l) => l.args.to.toLowerCase() === PROTOCOL_FEES_COLLECTOR_V2.toLowerCase())
                    .reduce((sum, l) => sum + l.args.value, 0n);
                console.log(`${poolId}: minted ${minted} BPT to the fee collector, tx ${hash}`);
            } catch (error) {
                failed++;
                console.log(`Error triggering protocol fees for pool ${poolId}: `, error);
            }
        }

        const balance = await walletClient.getBalance({ address: account.address });
        console.log(`Updater wallet ${account.address} S balance: ${Number(balance) / 1e18}`);

        if (failed > 0) core.setFailed(`Failed to trigger protocol fees for ${failed} of ${poolIds.length} pools`);
    } catch (error) {
        console.log(`error triggering v2 protocol fees: `, error);
        core.setFailed(error as Error);
    }
}

run();
