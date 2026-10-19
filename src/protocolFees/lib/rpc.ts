import { createPublicClient, http, PublicClient } from 'viem';
import { sonic } from 'viem/chains';
import { DEFAULT_RPC_URL, LOG_CHUNK_BLOCKS } from './config';

export type Client = PublicClient;

export type RawLog = {
    address: `0x${string}`;
    topics: `0x${string}`[];
    data: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    logIndex: number;
    blockTimestamp: number;
};

type RpcLog = {
    address: string;
    topics: `0x${string}`[];
    data: `0x${string}`;
    blockNumber: `0x${string}`;
    transactionHash: `0x${string}`;
    logIndex: `0x${string}`;
    blockTimestamp?: `0x${string}`;
    removed?: boolean;
};

export function makeClient(rpcUrl: string = process.env.SONIC_RPC_URL || DEFAULT_RPC_URL): Client {
    return createPublicClient({
        chain: sonic,
        transport: http(rpcUrl, {
            batch: { batchSize: 100, wait: 10 },
            retryCount: 5,
            retryDelay: 500,
            timeout: 60_000,
        }),
    });
}

const blockTsCache = new Map<string, number>();

export async function blockTimestamp(client: Client, blockNumber: bigint): Promise<number> {
    const key = blockNumber.toString();
    const cached = blockTsCache.get(key);
    if (cached !== undefined) return cached;
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    blockTsCache.set(key, ts);
    return ts;
}

/** First block whose timestamp >= ts (binary search). Returns latest + 1 when ts is in the future. */
export async function blockAtOrAfter(client: Client, ts: number, latest?: bigint): Promise<bigint> {
    let lo = 0n;
    let hi = latest ?? (await client.getBlockNumber());
    if ((await blockTimestamp(client, hi)) < ts) return hi + 1n;
    while (lo < hi) {
        const mid = (lo + hi) / 2n;
        if ((await blockTimestamp(client, mid)) < ts) lo = mid + 1n;
        else hi = mid;
    }
    return lo;
}

/** eth_getLogs over [fromBlock, toBlock] in chunks. Logs carry a block timestamp. */
export async function getLogsChunked(
    client: Client,
    params: { address: `0x${string}`; topics: (`0x${string}` | null)[]; fromBlock: bigint; toBlock: bigint },
): Promise<RawLog[]> {
    const out: RawLog[] = [];
    for (let start = params.fromBlock; start <= params.toBlock; start += LOG_CHUNK_BLOCKS) {
        const chunkEnd = start + LOG_CHUNK_BLOCKS - 1n;
        const end = chunkEnd < params.toBlock ? chunkEnd : params.toBlock;
        const raw = (await client.request({
            method: 'eth_getLogs',
            params: [
                {
                    address: params.address,
                    topics: params.topics,
                    fromBlock: `0x${start.toString(16)}`,
                    toBlock: `0x${end.toString(16)}`,
                },
            ],
        } as any)) as RpcLog[];
        for (const l of raw) {
            if (l.removed) continue;
            const blockNumber = BigInt(l.blockNumber);
            out.push({
                address: l.address.toLowerCase() as `0x${string}`,
                topics: l.topics,
                data: l.data,
                blockNumber,
                transactionHash: l.transactionHash,
                logIndex: Number(l.logIndex),
                blockTimestamp:
                    l.blockTimestamp !== undefined
                        ? Number(l.blockTimestamp)
                        : await blockTimestamp(client, blockNumber),
            });
        }
    }
    return out;
}
