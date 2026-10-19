import { formatUnits } from 'viem';
import { DEFILLAMA_COINS_URL, MAX_PRICE_AGE_SECONDS, VAULT_V2, VAULT_V3 } from './config';
import { balancerPoolAbi, erc20Abi, erc4626Abi, vaultV2Abi, vaultV3Abi } from './abi';
import { Client } from './rpc';

type TokenKind = 'llama' | 'erc4626' | 'bpt2' | 'bpt3' | 'unknown';
type LlamaPricePoint = { timestamp: number; price: number };

/**
 * Values tokens in USD at a specific point in time (timestamp + block).
 *  - Balancer BPT (v2 or v3): on-chain pool balances / supply at the block, constituents priced recursively
 *  - ERC4626 wrapper: convertToAssets at the block x underlying price
 *  - everything else: DefiLlama coins API, nearest price to the timestamp
 */
export class PriceOracle {
    private llamaCache = new Map<string, number | null>();
    private decimalsCache = new Map<string, number>();
    private kindCache = new Map<string, TokenKind>();
    public warnings: string[] = [];

    constructor(
        private client: Client,
        private log: (msg: string) => void = () => {},
    ) {}

    async decimals(token: string): Promise<number> {
        const t = token.toLowerCase() as `0x${string}`;
        const cached = this.decimalsCache.get(t);
        if (cached !== undefined) return cached;
        const d = await this.client.readContract({ address: t, abi: erc20Abi, functionName: 'decimals' });
        this.decimalsCache.set(t, d);
        return d;
    }

    /** Prefetch DefiLlama prices for a list of {token, ts} in a few batch calls. */
    async prefetchLlama(requests: { token: string; ts: number }[]): Promise<void> {
        const byToken = new Map<string, Set<number>>();
        for (const { token, ts } of requests) {
            const t = token.toLowerCase();
            if (this.llamaCache.has(`${t}:${ts}`)) continue;
            if (!byToken.has(t)) byToken.set(t, new Set());
            byToken.get(t)!.add(ts);
        }
        const entries = Array.from(byToken.entries());
        for (let i = 0; i < entries.length; i += 5) {
            const chunk = entries.slice(i, i + 5);
            const coins: Record<string, number[]> = {};
            for (const [t, tsSet] of chunk) coins[`sonic:${t}`] = Array.from(tsSet).sort((a, b) => a - b);
            const url = `${DEFILLAMA_COINS_URL}/batchHistorical?coins=${encodeURIComponent(
                JSON.stringify(coins),
            )}&searchWidth=6h`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`defillama ${res.status}: ${await res.text()}`);
            const json = (await res.json()) as { coins?: Record<string, { prices?: LlamaPricePoint[] }> };
            for (const [t, tsSet] of chunk) {
                const prices = json.coins?.[`sonic:${t}`]?.prices ?? [];
                for (const ts of tsSet) {
                    let best: LlamaPricePoint | null = null;
                    for (const p of prices) {
                        if (!best || Math.abs(p.timestamp - ts) < Math.abs(best.timestamp - ts)) best = p;
                    }
                    const ok = best && Math.abs(best.timestamp - ts) <= MAX_PRICE_AGE_SECONDS;
                    this.llamaCache.set(`${t}:${ts}`, ok && best ? best.price : null);
                }
            }
        }
    }

    async llamaPrice(token: string, ts: number): Promise<number | null> {
        const key = `${token.toLowerCase()}:${ts}`;
        if (!this.llamaCache.has(key)) await this.prefetchLlama([{ token, ts }]);
        return this.llamaCache.get(key) ?? null;
    }

    /** Token kind, cached. On-chain derivable kinds are checked first: DefiLlama lists some BPTs with sparse history. */
    async kind(token: string): Promise<TokenKind> {
        const t = token.toLowerCase() as `0x${string}`;
        const cached = this.kindCache.get(t);
        if (cached) return cached;
        let k: TokenKind = 'unknown';
        if (await this.isV3Pool(t)) k = 'bpt3';
        else if (await this.isV2Pool(t)) k = 'bpt2';
        else if (await this.isErc4626(t)) k = 'erc4626';
        else {
            const now = Math.floor(Date.now() / 1000) - 3600;
            if ((await this.llamaPrice(t, now)) !== null) k = 'llama';
        }
        this.kindCache.set(t, k);
        return k;
    }

    private async isV2Pool(token: `0x${string}`): Promise<boolean> {
        try {
            const poolId = await this.client.readContract({
                address: token,
                abi: balancerPoolAbi,
                functionName: 'getPoolId',
            });
            const [pool] = await this.client.readContract({
                address: VAULT_V2,
                abi: vaultV2Abi,
                functionName: 'getPool',
                args: [poolId],
            });
            return pool.toLowerCase() === token.toLowerCase();
        } catch {
            return false;
        }
    }

    private async isV3Pool(token: `0x${string}`): Promise<boolean> {
        try {
            return await this.client.readContract({
                address: VAULT_V3,
                abi: vaultV3Abi,
                functionName: 'isPoolRegistered',
                args: [token],
            });
        } catch {
            return false;
        }
    }

    private async isErc4626(token: `0x${string}`): Promise<boolean> {
        try {
            await this.client.readContract({ address: token, abi: erc4626Abi, functionName: 'asset' });
            await this.client.readContract({
                address: token,
                abi: erc4626Abi,
                functionName: 'convertToAssets',
                args: [10n ** 18n],
            });
            return true;
        } catch {
            return false;
        }
    }

    /** USD price of one whole token at (ts, blockNumber). null when it cannot be determined. */
    async price(token: string, ts: number, blockNumber: bigint, depth = 0): Promise<number | null> {
        const t = token.toLowerCase() as `0x${string}`;
        const k = await this.kind(t);
        if (k === 'llama') {
            const p = await this.llamaPrice(t, ts);
            if (p !== null) return p;
            this.warn(`no DefiLlama price for ${t} at ${ts}`);
            return null;
        }
        if (depth > 2) {
            this.warn(`price recursion too deep for ${t}`);
            return null;
        }
        if (k === 'erc4626') {
            const asset = await this.client.readContract({
                address: t,
                abi: erc4626Abi,
                functionName: 'asset',
                blockNumber,
            });
            const dec = await this.decimals(t);
            const assetDec = await this.decimals(asset);
            const rate = await this.client.readContract({
                address: t,
                abi: erc4626Abi,
                functionName: 'convertToAssets',
                args: [10n ** BigInt(dec)],
                blockNumber,
            });
            const under = await this.price(asset, ts, blockNumber, depth + 1);
            return under === null ? null : under * Number(formatUnits(rate, assetDec));
        }
        if (k === 'bpt2' || k === 'bpt3') return this.bptPrice(t, k, ts, blockNumber, depth);
        this.warn(`unpriceable token ${t}`);
        return null;
    }

    private async bptPrice(
        pool: `0x${string}`,
        kind: 'bpt2' | 'bpt3',
        ts: number,
        blockNumber: bigint,
        depth: number,
    ): Promise<number | null> {
        let tokens: readonly string[];
        let balances: readonly bigint[];
        let supply: bigint;
        if (kind === 'bpt2') {
            const poolId = await this.client.readContract({
                address: pool,
                abi: balancerPoolAbi,
                functionName: 'getPoolId',
            });
            [tokens, balances] = await this.client.readContract({
                address: VAULT_V2,
                abi: vaultV2Abi,
                functionName: 'getPoolTokens',
                args: [poolId],
                blockNumber,
            });
            // ComposableStable pools hold their own BPT; getActualSupply excludes it.
            try {
                supply = await this.client.readContract({
                    address: pool,
                    abi: balancerPoolAbi,
                    functionName: 'getActualSupply',
                    blockNumber,
                });
            } catch {
                supply = await this.client.readContract({
                    address: pool,
                    abi: erc20Abi,
                    functionName: 'totalSupply',
                    blockNumber,
                });
            }
        } else {
            const info = await this.client.readContract({
                address: VAULT_V3,
                abi: vaultV3Abi,
                functionName: 'getPoolTokenInfo',
                args: [pool],
                blockNumber,
            });
            tokens = info[0];
            balances = info[2];
            supply = await this.client.readContract({
                address: pool,
                abi: erc20Abi,
                functionName: 'totalSupply',
                blockNumber,
            });
        }

        let tvl = 0;
        for (let i = 0; i < tokens.length; i++) {
            const tk = tokens[i].toLowerCase();
            if (tk === pool.toLowerCase()) continue; // pre-minted BPT in composable pools
            const dec = await this.decimals(tk);
            const p = await this.price(tk, ts, blockNumber, depth + 1);
            if (p === null) {
                this.warn(`cannot price BPT ${pool}: token ${tk} unpriced`);
                return null;
            }
            tvl += p * Number(formatUnits(balances[i], dec));
        }
        const s = Number(formatUnits(supply, 18));
        return s > 0 ? tvl / s : null;
    }

    warn(msg: string): void {
        if (!this.warnings.includes(msg)) {
            this.warnings.push(msg);
            this.log(`WARN ${msg}`);
        }
    }
}
