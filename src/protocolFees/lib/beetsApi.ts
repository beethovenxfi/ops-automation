import { BEETS_API_URL } from './config';

export type PoolMeta = {
    id: string;
    address: string;
    symbol: string;
    name: string;
    type: string;
    protocolVersion: number;
};

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(BEETS_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`beets api ${res.status}`);
    const json = (await res.json()) as { data: T; errors?: unknown };
    if (json.errors) throw new Error(`beets api: ${JSON.stringify(json.errors)}`);
    return json.data;
}

/** Pool metadata (symbol, type, version). Returns null if the API does not know the pool. */
export async function getPoolMeta(poolId: string): Promise<PoolMeta | null> {
    try {
        const d = await gql<{ poolGetPool: PoolMeta }>(
            `query ($id: String!) { poolGetPool(chain: SONIC, id: $id) { id address symbol name type protocolVersion } }`,
            { id: poolId.toLowerCase() },
        );
        return d.poolGetPool;
    } catch (e) {
        return null;
    }
}
