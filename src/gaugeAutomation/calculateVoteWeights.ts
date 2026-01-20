import * as core from '@actions/core';
import * as fs from 'fs';
import snapshot from '@snapshot-labs/snapshot.js';
import { VOTE_WEIGHTS_CSV_PATH } from '../helpers/constants';
import path from 'path/win32';

interface Choice {
    [id: string]: number;
}

interface Vote {
    voter: string;
    choice: Choice;
    vp: number;
    vp_by_strategy: number[];
}

interface Delegation {
    delegator: string;
    delegate: string;
    space: string;
}

interface Strategy {
    name: string;
}

interface Proposal {
    choices: string[];
    snapshot: string;
    strategies: Strategy[];
    scores: number[];
    scores_total: number;
    votes: number;
    end: string;
}

type ResponseData<T> = {
    data: T;
};

type VoteData = {
    votes: Vote[];
};

type DelegationData = {
    delegations: Delegation[];
};

type ProposalData = {
    proposal: Proposal;
};

type VoteShare = {
    address: string;
    absoluteVotes: number;
    voteShare: number;
};

async function run(): Promise<void> {
    try {
        // const snapshotId = process.env.SNAPSHOT_ID;
        const snapshotId = '0x6cce317201455d4429d5d756f32f4f092690a2d9bf03879f23480b7b3f328c86';
        if (!snapshotId) {
            core.setFailed('Missing required environment variable SNAPSHOT_ID');
            return;
        }

        const snapshot = snapshotId;

        // prepare result object
        const resultList: Record<string, VoteShare[]> = {};

        // get the result for pool names and votes per pool
        console.log('Getting proposal result.');
        const proposalResult = await getProposalResults(snapshot);
        const block = Number(proposalResult.snapshot);

        // get all votes from snapshot
        console.log('Getting all votes.');
        const votes = await getAllVotes(snapshot);

        const delegatedVotes: Vote[] = [];

        console.log(`Counting ${votes.length} votes...`);
        for (const vote of votes) {
            // must believe that 2nd entry (index 1) is the delegated votes strategy
            if (vote.vp_by_strategy[1] !== 0) {
                // save to handle later
                delegatedVotes.push(vote);
                vote.vp -= vote.vp_by_strategy[1];
            }
            // only add if delegated vote still has voting power
            if (vote.vp)
                if (vote.vp > 0) {
                    const voteResults = getVoteSharesPerChoice(vote, proposalResult);
                    for (const poolName in voteResults) {
                        if (Object.prototype.hasOwnProperty.call(voteResults, poolName)) {
                            const voteResult = voteResults[poolName];
                            if (!(poolName in resultList)) {
                                resultList[poolName] = [];
                            }
                            resultList[poolName].push(voteResult);
                        }
                    }
                }
        }

        console.log(`Counting ${delegatedVotes.length} delegated votes...`);
        const delegations = await getDelegationsAtBlock(block);
        console.log(`Got ${delegations.length} delegations at block ${block}.`);

        for (const delegatedVote of delegatedVotes) {
            let delegationFrom = [];

            for (const delegation of delegations) {
                if (delegation.delegate.toLowerCase() === delegatedVote.voter.toLowerCase()) {
                    delegationFrom.push(delegation.delegator);
                }
            }
            console.log(`Vote by ${delegatedVote.voter} has ${delegationFrom.length} delegators.`);
            const delegators = await getVPForVoterAtBlock(delegationFrom, block);
            // need to check if any of the delegators voted themselves
            let totalDelegatedVP = 0;
            for (const delegator of delegators) {
                let votedSelf: Boolean = false;
                for (const vote of votes) {
                    if (vote.voter.toLowerCase() === delegator.delegatorAddress.toLowerCase()) {
                        // delegator actually voted himself, don't need to handle this one
                        votedSelf = true;
                        break;
                    }
                }
                if (!votedSelf) {
                    const delegatorVote: Vote = {
                        choice: delegatedVote.choice,
                        voter: delegator.delegatorAddress,
                        vp: delegator.votingPower,
                        vp_by_strategy: [],
                    };
                    totalDelegatedVP += delegator.votingPower;
                    const delegatorVoteShares = getVoteSharesPerChoice(delegatorVote, proposalResult);
                    for (const poolName in delegatorVoteShares) {
                        if (Object.prototype.hasOwnProperty.call(delegatorVoteShares, poolName)) {
                            const delegatorVoteResult = delegatorVoteShares[poolName];
                            if (!(poolName in resultList)) {
                                resultList[poolName] = [];
                            }
                            resultList[poolName].push(delegatorVoteResult);
                        }
                    }
                }
            }
            if (delegatedVote.vp_by_strategy[1] !== totalDelegatedVP) {
                console.log(`ATTENTION: delegated votes dont add up for delegator ${delegatedVote.voter}!`);
                console.log(`total VP - sum = ${delegatedVote.vp_by_strategy[1] - totalDelegatedVP}`);
            }
        }

        console.log('Some sanity checking...');

        // some sanity checking, allow for some rounding errors
        const precision = 14;
        const totalVotes = proposalResult.scores_total;
        let calculatedTotalVotes = 0;
        for (const poolName in resultList) {
            if (Object.prototype.hasOwnProperty.call(resultList, poolName)) {
                const votes = resultList[poolName];
                const poolTotalVotes = proposalResult.scores[proposalResult.choices.indexOf(poolName)];
                let calculatedPoolTotalVotes = 0;
                let calculatedTotalShares = 0;
                for (const vote of votes) {
                    calculatedPoolTotalVotes += vote.absoluteVotes;
                    calculatedTotalVotes += vote.absoluteVotes;
                    calculatedTotalShares += vote.voteShare;
                }
                if (
                    Number(calculatedPoolTotalVotes.toPrecision(precision)) !==
                    Number(poolTotalVotes.toPrecision(precision))
                ) {
                    throw new Error(
                        `Ohoh, pool total votes don't add up. Got ${calculatedPoolTotalVotes} but should be ${poolTotalVotes} for pool "${poolName}".`,
                    );
                }
                if (calculatedTotalShares && Number(calculatedTotalShares.toPrecision(precision)) !== 1) {
                    throw new Error(
                        `Ohoh, pool shares don't add up. Got ${calculatedTotalShares} but should be 1 for pool "${poolName}"`,
                    );
                }
            }
        }
        if (Number(calculatedTotalVotes.toPrecision(precision)) !== Number(totalVotes.toPrecision(precision))) {
            throw new Error(`Ohoh, total votes don't add up. Got ${calculatedTotalVotes} but should be ${totalVotes}`);
        }

        console.log('Done. Exporting...');
        // this is the result object, needs to be printed/saved as csv
        let date: Date = new Date();
        const headers = 'poolName,wallet,absoluteVotes,shareVote\n';
        const filenameFull = VOTE_WEIGHTS_CSV_PATH;
        fs.mkdirSync(path.dirname(filenameFull), { recursive: true });

        const fullFileStream = fs.createWriteStream(filenameFull, { flags: 'w' });
        fullFileStream.write(headers);

        for (const pool in resultList) {
            if (Object.prototype.hasOwnProperty.call(resultList, pool)) {
                const results = resultList[pool];
                for (const voter of results) {
                    if (voter.absoluteVotes === 0) continue;
                    const poolNoCommas = pool.replace(/,/g, '');
                    const out =
                        poolNoCommas + ',' + voter.address + ',' + voter.absoluteVotes + ',' + voter.voteShare + '\n';
                    fullFileStream.write(out);
                }
            }
        }
        fullFileStream.end();
        console.log(`Done. Exported results to ${filenameFull}`);
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

function getVoteSharesPerChoice(vote: Vote, proposalResult: Proposal): Record<string, VoteShare> {
    const voteSharesPerChoice: Record<string, VoteShare> = {};
    // calculate absolute votes per part
    let votingParts = 0;
    for (const choiceId in vote.choice) {
        if (Object.prototype.hasOwnProperty.call(vote.choice, choiceId)) {
            const part = vote.choice[choiceId];
            votingParts += part;
        }
    }
    let votesPerPart = vote.vp / votingParts;

    for (const choiceId in vote.choice) {
        if (Object.prototype.hasOwnProperty.call(vote.choice, choiceId)) {
            const part = vote.choice[choiceId];
            const poolName = proposalResult.choices[Number(choiceId) - 1];
            const poolTotalVotes = proposalResult.scores[Number(choiceId) - 1];
            // create Voter and add to result
            const newVoteForPool: VoteShare = {
                address: vote.voter,
                absoluteVotes: part * votesPerPart,
                voteShare: (part * votesPerPart) / poolTotalVotes,
            };
            voteSharesPerChoice[poolName] = newVoteForPool;
        }
    }
    return voteSharesPerChoice;
}

async function getVPForVoterAtBlock(
    voters: string[],
    block: number,
): Promise<{ delegatorAddress: string; votingPower: number }[]> {
    const space = 'beets-gauges.eth';
    const strategies = [
        {
            name: 'reliquary',
            params: {
                poolId: 0,
                symbol: 'maBEETS',
                decimals: 18,
                strategy: 'multiplier',
                maxVotingLevel: 10,
                minVotingLevel: 0,
                reliquaryAddress: '0x973670ce19594f857a7cd85ee834c7a74a941684',
                useLevelOnUpdate: false,
            },
        },
    ];
    const network = '146';

    const blockNumber = block;
    var totalVP: { delegatorAddress: string; votingPower: number }[] = [];
    const scores: Record<string, number>[] = await snapshot.utils.getScores(
        space,
        strategies,
        network,
        voters,
        blockNumber,
    );
    // need to lowercase all addresses in scores for comparison
    for (const score of scores) {
        for (const key in score) {
            if (Object.prototype.hasOwnProperty.call(score, key)) {
                const value = score[key];
                delete score[key];
                score[key.toLowerCase()] = value;
            }
        }
    }

    for (const voter of voters) {
        let VP = 0;
        if (scores[0][voter]) {
            VP += scores[0][voter];
        }
        totalVP.push({ delegatorAddress: voter, votingPower: VP });
    }
    return totalVP;
}

async function getAllVotes(snapshotProposal: string): Promise<Vote[]> {
    const graphURL = 'https://hub.snapshot.org/graphql';
    const response = await fetch(graphURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query { votes ( first: 1000, skip: 0, where: { proposal: "${snapshotProposal}" }, orderBy: "created", orderDirection: desc,) {voter choice vp vp_by_strategy }}`,
        }),
    });
    const votesRoot: ResponseData<VoteData> = (await response.json()) as ResponseData<VoteData>;
    return votesRoot.data.votes;
}

async function getDelegationsAtBlock(block: number): Promise<Delegation[]> {
    const graphURL =
        'https://gateway.thegraph.com/api/1add03d07281af0421d1d7de10968914/subgraphs/id/3VUpuJv8J7kdvEMd6ymD1XszpGNQiTjK5oGAnmS3C2Bb';
    const response = await fetch(graphURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query { delegations (first: 1000, block: {number: ${block}}, where: {space_in: ["beets-gauges.eth", ""]}) { delegator delegate space } }`,
        }),
    });

    const delegationsRoot: ResponseData<DelegationData> = (await response.json()) as ResponseData<DelegationData>;
    const delegations = delegationsRoot.data.delegations;

    const response2 = await fetch(graphURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query { delegations (first: 1000, skip: 1000, block: {number: ${block}}, where: {space_in: ["beets-gauges.eth", ""]}) { delegator delegate space } }`,
        }),
    });

    const delegationsRoot2: ResponseData<DelegationData> = (await response2.json()) as ResponseData<DelegationData>;
    delegations.push(...delegationsRoot2.data.delegations);

    //remove multi delegations in different spaces
    const delegatorsToRemove = new Set<number>();
    for (const delegation of delegations) {
        const delegatorDelegations = [];
        for (const delegationInner of delegations) {
            if (delegation.delegator === delegationInner.delegator) {
                delegatorDelegations.push(delegations.indexOf(delegationInner));
            }
        }
        if (delegatorDelegations.length > 1) {
            if (delegations[delegatorDelegations[0]].space !== 'beets-gauges.eth') {
                delegatorsToRemove.add(delegatorDelegations[0]);
            } else {
                delegatorsToRemove.add(delegatorDelegations[1]);
            }
        }
    }
    for (const delegatorToRemove of delegatorsToRemove) {
        delegations.splice(delegatorToRemove, 1);
    }

    return delegations;
}

async function getProposalResults(snapshotProposal: string): Promise<Proposal> {
    const graphURL = 'https://hub.snapshot.org/graphql';
    const response = await fetch(graphURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query Proposal { proposal(id: "${snapshotProposal}") { choices snapshot strategies { name } scores scores_total votes end } }`,
        }),
    });
    const proposalRoot: ResponseData<ProposalData> = (await response.json()) as ResponseData<ProposalData>;
    if (proposalRoot.data.proposal === null) {
        throw new Error(`Snapshot ID "${snapshotProposal}" not found on ${graphURL}`);
    }
    return proposalRoot.data.proposal;
}

run();
