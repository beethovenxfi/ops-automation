import * as core from '@actions/core';
import { formatEther, parseEther } from 'viem';
import { getHiddenHandProposalHashes } from '../helpers/utils';
import { readGaugeDataFromGoogleSheet } from '../helpers/googleSheetHelper';
import { createTxnBatchForHiddenHandBribes, DepositBribeTxnInput } from '../helpers/createSafeTransactionJson';

async function run(): Promise<void> {
    const endTime = process.env.VOTE_END_TIMESTAMP;
    if (!endTime) {
        core.setFailed('Missing required environment variable VOTE_END_TIMESTAMP');
        return;
    }

    try {
        const gaugeData = await readGaugeDataFromGoogleSheet();

        const proposalHashes = await getHiddenHandProposalHashes(endTime);

        const bribeInputs: DepositBribeTxnInput[] = [];
        let totalBeetsBribeAmount = 0n;

        for (const gauge of gaugeData) {
            if (!gauge.protocolBounties || gauge.protocolBounties === '0') {
                continue; // Skip gauges with no protocol bounties
            }
            const hiddenHandProposal = proposalHashes.find((proposal) => proposal.title === gauge.poolTokenName);
            if (!hiddenHandProposal) {
                core.setFailed(`No Hiddenhand proposal found for ${gauge.poolTokenName}`);
                return;
            }

            totalBeetsBribeAmount += parseEther(gauge.protocolBounties);

            bribeInputs.push({
                bribeAmountInWei: parseEther(gauge.protocolBounties),
                proposalHash: hiddenHandProposal.proposalHash,
            });
        }

        console.log(`Creating bribe payload for ${endTime}`);
        console.log(`Total Beets for bribes: ${formatEther(totalBeetsBribeAmount)}`);

        // build list of txns
        createTxnBatchForHiddenHandBribes(parseFloat(endTime), bribeInputs);
    } catch (error) {
        console.log(`Error generating bribe payload: `, error);
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
