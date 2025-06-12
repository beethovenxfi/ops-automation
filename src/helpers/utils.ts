import moment from 'moment';
import { VOTE_END_HOUR_UTC, VOTE_START_HOUR_UTC } from './constants';
export type SnapshotProposal = {
    choices: string[];
    scores: number[];
};

export type SnapshotResult = {
    totalVotes: number;
    result: {
        poolName: string;
        poolId: string;
        votes: number;
        weight: number;
        beetsAmountWei: string;
    }[];
};

export type GaugeData = {
    beetsToDistribute: string;
    startTimestamp: number;
    endTimestamp: number;
    snapshotBlock: number;
    gauges: {
        poolName: string;
        poolId: string;
        onSnapshot: boolean;
    }[];
};

export function getVoteEndTimestamp(day: string): number {
    const date = moment.utc(day, 'YYYY-MM-DD');
    const endTime = date.set({ hour: VOTE_START_HOUR_UTC, minute: 0, second: 0, millisecond: 0 });

    return endTime.unix();
}

export async function getSnapshotBlockFromStartTimestamp(timestamp: number): Promise<number> {
    const snapshotTimestamp = moment.unix(timestamp).startOf('day').subtract(1, 'day').unix();

    const response = await fetch(
        `https://api.sonicscan.org/api?module=block&action=getblocknobytime&timestamp=${snapshotTimestamp}&closest=before&apikey=${process.env.SONICSCAN_APIKEY}`,
    );

    const data = (await response.json()) as { status: string; message: string; result: string };

    return parseFloat(data.result);
}

export function getVoteStartTimestamp(day: string): number {
    const date = moment.utc(day, 'YYYY-MM-DD');
    const startTime = date.set({ hour: VOTE_END_HOUR_UTC, minute: 0, second: 0, millisecond: 0 });
    return startTime.unix();
}

export async function getHiddenHandProposalHashes(voteEndTimestamp: string) {
    const hiddenHandApiUrl = 'https://api.hiddenhand.finance/proposal/beets/' + voteEndTimestamp;

    const response = await fetch(hiddenHandApiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });
    const proposalData = (await response.json()) as { data: { proposalHash: string; title: string }[] };
    return proposalData.data.map((proposal) => ({
        proposalHash: proposal.proposalHash,
        title: proposal.title,
    }));
}

export async function getGaugesForPools(poolIds: string[]) {
    const backendUrl = 'https://backend-v3.beets-ftm-node.com/';
    const backendQuery = `{
            poolGetPools(where:{ chainIn:[SONIC], idIn:[${poolIds.map((id) => `"${id}"`).join(',')}] }){
            id
            name
            address
            staking{
                gauge{
                gaugeAddress
                }
            }
            }}
        `;

    const backendResponse = await fetch(backendUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: backendQuery }),
    });

    const gaugesData = (await backendResponse.json()) as {
        data: {
            poolGetPools: {
                id: string;
                name: string;
                address: string;
                staking?: { gauge: { gaugeAddress: string } };
            }[];
        };
    };

    return gaugesData.data.poolGetPools;
}

export async function getV3PoolIds() {
    if (!process.env.GRAPH_KEY) {
        throw new Error('Missing required environment variables GRAPH_KEY');
    }
    const graphURL = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_KEY}/deployments/id/QmUgRWkb5JUocGkVidpKtZFMHjexJzkBiSbjufURsXwn9X`;

    const limit = 1000;
    let hasMore = true;
    let id = `0x`;
    let poolIds: string[] = [];

    while (hasMore) {
        const query = `{
        pools(where: { isInitialized: true, id_gt: "${id}" }, orderBy: id, orderDirection: asc, first: ${limit}) {
           id
        }
        }`;
        const response = await fetch(graphURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query }),
        });

        const jsonResponse = (await response.json()) as { data: { pools: { id: string }[] } };

        poolIds = [...poolIds, ...jsonResponse.data.pools.map((p) => p.id)];

        if (jsonResponse.data.pools.length < limit) {
            hasMore = false;
        } else {
            id = jsonResponse.data.pools[jsonResponse.data.pools.length - 1].id;
        }
    }

    return poolIds.map((pool) => pool.toLowerCase());
}
