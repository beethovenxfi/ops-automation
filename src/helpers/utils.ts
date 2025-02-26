import moment from 'moment';
import { VOTE_END_HOUR_UTC, VOTE_START_HOUR_UTC } from './constants';

export type GaugeChoice = {
    poolName: string;
    poolAddres: string;
    poolId: string;
    gaugeAddress: string;
};

export function getVoteEndTimestamp(day: string): number {
    const date = moment(day, 'YYYY-MM-DD');
    const endTime = date.utc().set({ hour: VOTE_START_HOUR_UTC, minute: 0, second: 0, millisecond: 0 });

    return endTime.unix();
}

export function getVoteStartTimestamp(day: string): number {
    const date = moment(day, 'YYYY-MM-DD');
    const startTime = date.utc().set({ hour: VOTE_END_HOUR_UTC, minute: 0, second: 0, millisecond: 0 });
    return startTime.unix();
}
