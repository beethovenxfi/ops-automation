import * as core from '@actions/core';
import { SCETH, SCUSD, VEETH_MARKET, VEUSD_MARKET } from '../helpers/constants';
import { createTxnForTreveeBounty } from '../helpers/createSafeTransaction';

async function run(): Promise<void> {
    try {
        const amount = process.env.AMOUNT;
        const market = process.env.MARKET;
        const minRewardPerVote = process.env.MIN_REWARD_PER_VOTE;
        const maxRewardPerVote = process.env.MAX_REWARD_PER_VOTE;

        if (!amount || !market || !minRewardPerVote || !maxRewardPerVote) {
            core.setFailed('Missing required environment variables');
            return;
        }

        createTxnForTreveeBounty(
            market === 'veUSD' ? VEUSD_MARKET : VEETH_MARKET,
            market === 'veUSD' ? SCUSD : SCETH,
            amount,
            minRewardPerVote,
            maxRewardPerVote,
        );
    } catch (error) {
        console.log(`error creating trevee bounty: `, error);
        core.setFailed(error as Error);
    }
}

run();
