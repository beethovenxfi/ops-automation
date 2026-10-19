import { blockAtOrAfter, makeClient } from './rpc';
import { collectFeeEvents, FeeEvent, FeeType, poolAddressOf, poolVersion, priceFeeEvents } from './fees';
import { PriceOracle } from './prices';
import { getPoolMeta } from './beetsApi';

export type TokenTotal = {
    feeType: FeeType;
    token: string;
    amount: number;
    usd: number;
    events: number;
    unpricedAmount: number;
};

export type PoolResult = {
    poolId: string;
    address: string;
    version: 2 | 3;
    symbol: string | null;
    name: string | null;
    type: string | null;
    usd: number;
    sharePct: number;
    tokens: TokenTotal[];
    eventCount: number;
    unpricedEvents: number;
    events: FeeEvent[];
};

export type CalcResult = {
    start: number;
    end: number;
    fromBlock: bigint;
    toBlock: bigint;
    pools: PoolResult[];
    totalUsd: number;
    warnings: string[];
};

/**
 * Protocol fees withdrawn by Mimic per pool in [start, end) (unix seconds, UTC), priced at withdrawal time.
 */
export async function calculateProtocolFees(params: {
    poolIds: string[];
    start: number;
    end: number;
    rpcUrl?: string;
    log?: (msg: string) => void;
}): Promise<CalcResult> {
    const log = params.log ?? (() => {});
    const client = makeClient(params.rpcUrl);
    const latest = await client.getBlockNumber();
    const fromBlock = await blockAtOrAfter(client, params.start, latest);
    const toBlockExcl = await blockAtOrAfter(client, params.end, latest);
    const toBlock = toBlockExcl - 1n;
    log(`block range ${fromBlock} .. ${toBlock} (latest ${latest})`);

    const oracle = new PriceOracle(client, log);
    const pools: PoolResult[] = [];
    for (const rawId of params.poolIds) {
        const id = rawId.toLowerCase();
        const version = poolVersion(id);
        const address = poolAddressOf(id);
        const meta = await getPoolMeta(id);
        log(`pool ${meta?.symbol ?? address} (v${version}) ...`);
        const { events, notes } = await collectFeeEvents(client, id, fromBlock, toBlock);
        for (const n of notes) oracle.warn(n);
        await priceFeeEvents(events, oracle);

        const byToken = new Map<string, TokenTotal>();
        let usd = 0;
        let unpriced = 0;
        for (const e of events) {
            const k = `${e.feeType}:${e.token}`;
            let t = byToken.get(k);
            if (!t) {
                t = { feeType: e.feeType, token: e.token, amount: 0, usd: 0, events: 0, unpricedAmount: 0 };
                byToken.set(k, t);
            }
            t.amount += e.amount ?? 0;
            t.events += 1;
            if (e.usd === null || e.usd === undefined) {
                t.unpricedAmount += e.amount ?? 0;
                unpriced += 1;
            } else {
                t.usd += e.usd;
                usd += e.usd;
            }
        }
        pools.push({
            poolId: id,
            address,
            version,
            symbol: meta?.symbol ?? null,
            name: meta?.name ?? null,
            type: meta?.type ?? null,
            usd,
            sharePct: 0,
            tokens: Array.from(byToken.values()),
            eventCount: events.length,
            unpricedEvents: unpriced,
            events,
        });
    }
    const totalUsd = pools.reduce((s, p) => s + p.usd, 0);
    for (const p of pools) p.sharePct = totalUsd > 0 ? (100 * p.usd) / totalUsd : 0;
    return { start: params.start, end: params.end, fromBlock, toBlock, pools, totalUsd, warnings: oracle.warnings };
}
