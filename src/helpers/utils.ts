import moment from 'moment';
import { VOTE_END_HOUR_UTC, VOTE_START_HOUR_UTC } from './constants';

export type GaugeChoice = {
    [poolName: string]: string;
};

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
        weeklyBeetsAmountFromGauge: string;
        weeklyBeetsAmountFromMD: string;
    }[];
};

export function getVoteEndTimestamp(day: string): number {
    const date = moment(day, 'YYYY-MM-DD');
    const endTime = date.utc().set({ hour: VOTE_START_HOUR_UTC, minute: 0, second: 0, millisecond: 0 });

    return endTime.unix();
}

export function getVoteStartTimestamp(day: string): number {
    const date = moment(day, 'YYYY-MM-DD');
    console.log(date);
    const startTime = date.utc().set({ hour: VOTE_END_HOUR_UTC, minute: 0, second: 0, millisecond: 0 });
    console.log(startTime);
    return startTime.unix();
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
    const backendUrl = 'https://backend-v3.beets-ftm-node.com/';
    const backendQuery = `{
            poolGetPools(where:{ chainIn:[SONIC], protocolVersionIn:[3] }){
            id
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
            }[];
        };
    };

    return gaugesData.data.poolGetPools.map((pool) => pool.id);
}
