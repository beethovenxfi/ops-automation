import * as core from '@actions/core';
import moment from 'moment';
import * as fs from 'fs';
import { ProposalType } from '@snapshot-labs/snapshot.js/dist/src/sign/types';
import { Wallet } from '@ethersproject/wallet';
import snapshot from '@snapshot-labs/snapshot.js';
import {
    getVoteStartTimestamp,
    getVoteEndTimestamp,
    GaugeChoice,
    GaugeData,
    getSnapshotBlockFromStartTimestamp,
} from '../helpers/utils';
import {
    FIRST_GAUGE_VOTE_DAY,
    TWO_WEEKS_IN_SECONDS,
    DAYS_DELTA_BETWEEN_VOTE_END_AND_EMISSION_START,
    SNAPSHOT_HUB_URL,
    SNAPSHOT_SPACE,
    DAYS_FOR_EMISSIONS,
} from '../helpers/constants';

async function run(): Promise<void> {
    try {
        if (!process.env.BEETS_TO_DISTRIBUTE || !process.env.VOTE_START_DAY || !process.env.VOTE_END_DAY) {
            throw new Error('Missing required environment variables');
        }

        console.log(`Distributing ${process.env.BEETS_TO_DISTRIBUTE} BEETS next epoch`);
        console.log(`Starting ${process.env.VOTE_START_DAY}`);
        console.log(`Ending ${process.env.VOTE_END_DAY}`);

        const startTimestamp = getVoteStartTimestamp(process.env.VOTE_START_DAY || '');
        const endTimestamp = getVoteEndTimestamp(process.env.VOTE_END_DAY || '');
        const snapshotBlock = await getSnapshotBlockFromStartTimestamp(startTimestamp);

        const choices: GaugeChoice = JSON.parse(
            fs.readFileSync('./src/gaugeAutomation/gauge-choices/choices-init.json', 'utf-8'),
        ) as GaugeChoice;

        const gaugeDataForRound: GaugeData = {
            beetsToDistribute: process.env.BEETS_TO_DISTRIBUTE,
            startTimestamp,
            endTimestamp,
            snapshotBlock,
            gauges: Object.keys(choices).map((poolName) => {
                return {
                    poolName: poolName,
                    poolId: choices[poolName].toLowerCase(),
                    weeklyBeetsAmountFromGauge: '0',
                    weeklyBeetsAmountFromMD: '0',
                    weeklyStSRewards: '0',
                    weeklyStSRewardsFromSeasons: '0',
                    weeklyFragmentsRewards: '0',
                };
            }),
        };

        fs.writeFileSync(
            `./src/gaugeAutomation/gauge-data/${endTimestamp}.json`,
            JSON.stringify(gaugeDataForRound, null, 2),
        );

        await createSnapshot(startTimestamp, endTimestamp, snapshotBlock, choices);
    } catch (error) {
        console.log(`erroring`);
        core.setFailed(error as Error);
    }
}

async function createSnapshot(
    startTimestamp: number,
    endTimestamp: number,
    snapshotBlock: number,
    choices: GaugeChoice,
): Promise<void> {
    const poolNames = Object.keys(choices);
    console.log('Choices:');
    console.log(poolNames);

    // create snapshot vote
    console.log('Creating proposal on snapshot');

    const client = new snapshot.Client712(SNAPSHOT_HUB_URL);
    const space = SNAPSHOT_SPACE;

    console.log('Start date:', moment.unix(startTimestamp).format('YYYY-MM-DD HH:mm:ss'));
    console.log('End date:', moment.unix(endTimestamp).format('YYYY-MM-DD HH:mm:ss'));
    console.log(`Snapshot: ${snapshotBlock}`);
    console.log(`Space: ${space}`);

    const gaugeVoteRoundNumber =
        (startTimestamp - getVoteStartTimestamp(FIRST_GAUGE_VOTE_DAY)) / TWO_WEEKS_IN_SECONDS + 1;

    const title = `Beets Sonic gauge vote (Round ${gaugeVoteRoundNumber})`;
    console.log(`Title: ${title}`);

    const body = `This vote decides the distribution of ${
        process.env.BEETS_TO_DISTRIBUTE
    } BEETS to gauge emissions for the period of ${moment(process.env.VOTE_END_DAY, 'YYYY-MM-DD')
        .add(DAYS_DELTA_BETWEEN_VOTE_END_AND_EMISSION_START, 'days')
        .format('MMMM Do YYYY')} to ${moment(process.env.VOTE_END_DAY, 'YYYY-MM-DD')
        .add(DAYS_DELTA_BETWEEN_VOTE_END_AND_EMISSION_START, 'days')
        .add(DAYS_FOR_EMISSIONS, 'days')
        .format('MMMM Do YYYY')}.

To vote, distribute your voting power among pools. You can vote for as many or as few gauges as you wish. You can also vote as many times as you like, overwriting your previous vote with a new vote. The aggregate distribution of responses will be used to calculate the reward distribution.

Pools may have voting incentives provided by Beets and/or other protocols, please check Beets discord for details.`;

    const proposal = {
        space,
        type: 'weighted' as ProposalType,
        title,
        body,
        discussion: '',
        choices: Object.keys(choices),
        start: startTimestamp,
        end: endTimestamp,
        snapshot: Number(snapshotBlock),
        network: '146',
        strategies: JSON.stringify({}),
        plugins: JSON.stringify({}),
        metadata: JSON.stringify({}),
    };
    console.log('Proposal:', JSON.stringify(proposal, null, 2));

    let wallet = new Wallet(process.env.PROPOSER_WALLET!);
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.proposal(wallet, wallet.address, proposal);
    } catch (error) {
        console.log('Submitting failed');
        console.log(error);
        throw error;
    }
}

run();
