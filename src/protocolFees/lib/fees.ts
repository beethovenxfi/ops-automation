import { decodeEventLog, formatUnits, pad } from 'viem';
import { PROTOCOL_FEE_CONTROLLER_V3, PROTOCOL_FEES_COLLECTOR_V2, VAULT_V2 } from './config';
import { erc20Abi, protocolFeeControllerV3Abi, vaultV2Abi } from './abi';
import { Client, getLogsChunked, RawLog } from './rpc';
import { PriceOracle } from './prices';

const TOPIC_POOL_BALANCE_CHANGED = '0xe5ce249087ce04f05a957192435400fd97868dba0e6a4b4c049abf8af80dae78';
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOPIC_V3_FEES_WITHDRAWN = '0x1c2887fcb98f75e66bb9a36311f2d3d22fb204e6362106f30e9df7eaf63131b5';

export type FeeType = 'v2_bpt' | 'v3_withdraw';

export type FeeEvent = {
    ts: number;
    blockNumber: bigint;
    logIndex: number;
    txHash: string;
    token: string;
    recipient: string;
    amountRaw: bigint;
    feeType: FeeType;
    decimals?: number;
    amount?: number;
    price?: number | null;
    usd?: number | null;
};

export function poolVersion(poolId: string): 2 | 3 {
    const hex = poolId.toLowerCase().replace(/^0x/, '');
    if (hex.length === 64) return 2;
    if (hex.length === 40) return 3;
    throw new Error(`invalid pool id ${poolId}`);
}

export function poolAddressOf(poolId: string): `0x${string}` {
    return ('0x' + poolId.toLowerCase().replace(/^0x/, '').slice(0, 40)) as `0x${string}`;
}

/**
 * Protocol fee *withdrawals* for one pool in [fromBlock, toBlock]. Fees are attributed to the pool at the moment
 * Mimic withdraws them (right before they are sold), not when they were collected.
 *
 *   v2: BPT transferred out of the ProtocolFeesCollector (pool-specific token, so attribution is exact) -> 'v2_bpt'
 *   v3: ProtocolFeeController.ProtocolFeesWithdrawn(pool, token, recipient, amount)                     -> 'v3_withdraw'
 */
export async function collectFeeEvents(
    client: Client,
    poolId: string,
    fromBlock: bigint,
    toBlock: bigint,
): Promise<{ events: FeeEvent[]; notes: string[] }> {
    const version = poolVersion(poolId);
    const pool = poolAddressOf(poolId);
    const events: FeeEvent[] = [];
    const notes: string[] = [];

    if (version === 2) {
        const outflows = await getLogsChunked(client, {
            address: pool,
            topics: [TOPIC_TRANSFER, pad(PROTOCOL_FEES_COLLECTOR_V2.toLowerCase() as `0x${string}`)],
            fromBlock,
            toBlock,
        });
        for (const l of outflows) {
            const { args } = decodeEventLog({
                abi: erc20Abi,
                data: l.data,
                topics: l.topics as any,
                eventName: 'Transfer',
            });
            if (args.value > 0n) events.push(base(l, pool, args.value, 'v2_bpt', args.to));
        }
        // Legacy v2 pools can pay protocol fees in pool tokens (PoolBalanceChanged.protocolFeeAmounts). Those tokens
        // are not pool-specific once in the collector, so their withdrawal cannot be attributed. Flag if any occurred.
        const pbc = await getLogsChunked(client, {
            address: VAULT_V2,
            topics: [TOPIC_POOL_BALANCE_CHANGED, poolId.toLowerCase() as `0x${string}`],
            fromBlock,
            toBlock,
        });
        const tokenFees = new Map<string, bigint>();
        for (const l of pbc) {
            const { args } = decodeEventLog({
                abi: vaultV2Abi,
                data: l.data,
                topics: l.topics as any,
                eventName: 'PoolBalanceChanged',
            });
            args.tokens.forEach((t, i) => {
                const amt = args.protocolFeeAmounts[i];
                if (amt > 0n) tokenFees.set(t.toLowerCase(), (tokenFees.get(t.toLowerCase()) ?? 0n) + amt);
            });
        }
        for (const [t, amt] of tokenFees) {
            notes.push(
                `pool ${pool} paid ${amt} raw of token ${t} as protocol fee in pool tokens (PoolBalanceChanged); not attributable at withdrawal, excluded`,
            );
        }
    } else {
        const logs = await getLogsChunked(client, {
            address: PROTOCOL_FEE_CONTROLLER_V3,
            topics: [TOPIC_V3_FEES_WITHDRAWN, pad(pool)],
            fromBlock,
            toBlock,
        });
        for (const l of logs) {
            const { args } = decodeEventLog({
                abi: protocolFeeControllerV3Abi,
                data: l.data,
                topics: l.topics as any,
                eventName: 'ProtocolFeesWithdrawn',
            });
            if (args.amount > 0n) events.push(base(l, args.token, args.amount, 'v3_withdraw', args.recipient));
        }
    }
    events.sort((a, b) =>
        a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex,
    );
    return { events, notes };
}

function base(l: RawLog, token: string, amountRaw: bigint, feeType: FeeType, recipient: string): FeeEvent {
    return {
        ts: l.blockTimestamp,
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
        txHash: l.transactionHash,
        token: token.toLowerCase(),
        recipient: recipient.toLowerCase(),
        amountRaw,
        feeType,
    };
}

/** Attach decimals, price (at withdrawal block/time) and usd to each event. */
export async function priceFeeEvents(events: FeeEvent[], oracle: PriceOracle): Promise<FeeEvent[]> {
    const direct: { token: string; ts: number }[] = [];
    for (const e of events) if ((await oracle.kind(e.token)) === 'llama') direct.push({ token: e.token, ts: e.ts });
    await oracle.prefetchLlama(direct);

    for (const e of events) {
        e.decimals = await oracle.decimals(e.token);
        e.amount = Number(formatUnits(e.amountRaw, e.decimals));
        e.price = await oracle.price(e.token, e.ts, e.blockNumber);
        e.usd = e.price === null ? null : e.amount * e.price;
    }
    return events;
}
