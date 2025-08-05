import * as core from '@actions/core';
import { createTxnForTreveeBounty } from '../helpers/createSafeTransaction';

async function run(): Promise<void> {
    try {
        const amountUsd = process.env.AMOUNT_USD;
        const minRewardPerVoteUsd = process.env.MIN_REWARD_PER_VOTE_USD;
        const maxRewardPerVoteUsd = process.env.MAX_REWARD_PER_VOTE_USD;
        const amountEth = process.env.AMOUNT_ETH;
        const minRewardPerVoteEth = process.env.MIN_REWARD_PER_VOTE_ETH;
        const maxRewardPerVoteEth = process.env.MAX_REWARD_PER_VOTE_ETH;

        // const amountUsd = '2459'; // Example value, replace with actual environment variable
        // const minRewardPerVoteUsd = '0.0032'; // Example value, replace with actual environment variable
        // const maxRewardPerVoteUsd = '0.0044'; // Example value, replace with actual environment variable
        // const amountEth = '0.5893'; // Example value, replace with actual environment variable
        // const minRewardPerVoteEth = '0.0046'; // Example value, replace with actual environment variable
        // const maxRewardPerVoteEth = '0.0062'; // Example value, replace with actual environment variable

        if (
            !amountUsd ||
            !minRewardPerVoteUsd ||
            !maxRewardPerVoteUsd ||
            !amountEth ||
            !minRewardPerVoteEth ||
            !maxRewardPerVoteEth
        ) {
            core.setFailed('Missing required environment variables');
            return;
        }

        createTxnForTreveeBounty(
            amountUsd,
            minRewardPerVoteUsd,
            maxRewardPerVoteUsd,
            amountEth,
            minRewardPerVoteEth,
            maxRewardPerVoteEth,
        );
    } catch (error) {
        console.log(`error creating trevee bounty: `, error);
        core.setFailed(error as Error);
    }
}

run();
