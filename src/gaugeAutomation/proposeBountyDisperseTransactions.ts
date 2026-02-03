import * as core from '@actions/core';
import { parseUnits } from 'viem';
import { LM_GAUGE_MSIG, MSIG_DISCORD_CHANNEL, MUSIC_DIRECTOR_ID } from '../helpers/constants';
import { createTxnBatchForBountyDisperse, DisperseBountiesTxnInput } from '../helpers/safeCreateJsonBatch';
import { sendMessage } from '../helpers/discord-bot';
import { proposeBatch } from '../helpers/safeProposeJsonBatch';
import { readVoteWeightsFromCSV, VoteWeightsDataRow } from '../helpers/csvHelper';
import { BountyData, readBountiesFromGoogleSheet } from '../helpers/googleSheetHelper';

async function run(): Promise<void> {
    try {
        // Read vote weights data from CSV
        const voteWeightDataRows: VoteWeightsDataRow[] = await readVoteWeightsFromCSV();

        // Read bounties from google sheet
        const bountyDataRows: BountyData[] = await readBountiesFromGoogleSheet();

        // Convert CSV data to transaction inputs
        const recipientData: {
            [voterAddress: string]: {
                [bountyToken: string]: bigint;
            };
        } = {};

        const totalBountyAmountsDisperse: { [bountyToken: string]: bigint } = {};

        for (const voteWeightRow of voteWeightDataRows) {
            const bounties = bountyDataRows.filter((bounty) => bounty.poolTokenName === voteWeightRow.poolName);
            if (bounties.length === 0) continue; // no bounty for this pool
            for (const bounty of bounties) {
                const voterAddress = voteWeightRow.voterAddress.toLowerCase();
                const bountyToken = bounty.bountyTokenAddress;
                const voterBountyAmount = (
                    parseFloat(bounty.bountyAmount) * parseFloat(voteWeightRow.shareVote)
                ).toFixed(18);
                const voterBountyAmountWei = parseUnits(
                    voterBountyAmount.toString(),
                    parseFloat(bounty.bountyTokenDecimals),
                );
                if (!recipientData[voterAddress]) {
                    recipientData[voterAddress] = {};
                }
                if (!recipientData[voterAddress][bountyToken]) {
                    recipientData[voterAddress][bountyToken] = 0n;
                }
                recipientData[voterAddress][bountyToken] += voterBountyAmountWei;

                if (!totalBountyAmountsDisperse[bountyToken]) {
                    totalBountyAmountsDisperse[bountyToken] = 0n;
                }
                totalBountyAmountsDisperse[bountyToken] += voterBountyAmountWei;
            }
        }
        const totalBountyAmountsSheet: { [bountyToken: string]: bigint } = {};
        for (const bounty of bountyDataRows) {
            const bountyToken = bounty.bountyTokenAddress;
            const bountyAmountWei = parseUnits(bounty.bountyAmount.toString(), parseFloat(bounty.bountyTokenDecimals));
            totalBountyAmountsSheet[bountyToken] = (totalBountyAmountsSheet[bountyToken] || 0n) + bountyAmountWei;
        }

        // verify totals match
        for (const bountyToken in totalBountyAmountsSheet) {
            const sheetAmount = totalBountyAmountsSheet[bountyToken] || 0n;
            const disperseAmount = totalBountyAmountsDisperse[bountyToken] || 0n;
            if (sheetAmount !== disperseAmount) {
                //correct a user amounts if needed
                if (sheetAmount > disperseAmount) {
                    const diff = sheetAmount - disperseAmount;

                    const firstVoter = Object.keys(recipientData)[0];
                    recipientData[firstVoter][bountyToken] = (recipientData[firstVoter][bountyToken] || 0n) + diff;
                    console.log(
                        `Corrected first voter ${firstVoter} by adding ${diff.toString()} wei of token ${bountyToken}`,
                    );
                } else {
                    const diff = disperseAmount - sheetAmount;
                    // loop through voters and subtract from first with enough balance
                    for (const voterAddress in recipientData) {
                        if ((recipientData[voterAddress][bountyToken] || 0n) >= diff) {
                            recipientData[voterAddress][bountyToken] =
                                (recipientData[voterAddress][bountyToken] || 0n) - diff;
                            console.log(
                                `Corrected voter ${voterAddress} by subtracting ${diff.toString()} wei of token ${bountyToken} to new total of ${recipientData[voterAddress][bountyToken].toString()}`,
                            );
                            break;
                        }
                    }
                }
            } else {
                console.log(`Total bounty amount verified for token ${bountyToken}: ${sheetAmount.toString()}`);
            }
        }

        // Prepare disperse transaction inputs
        const disperseInputs: DisperseBountiesTxnInput[] = [];
        for (const voterAddress in recipientData) {
            for (const bountyToken in recipientData[voterAddress]) {
                const tokenInput = disperseInputs.find((input) => input.tokenAddress === bountyToken);
                if (!tokenInput) {
                    disperseInputs.push({
                        tokenAddress: bountyToken as `0x${string}`,
                        recipients: [{ address: voterAddress, amountInWei: recipientData[voterAddress][bountyToken] }],
                    });
                } else {
                    tokenInput.recipients.push({
                        address: voterAddress,
                        amountInWei: recipientData[voterAddress][bountyToken],
                    });
                }
            }
        }

        console.log(`Proposing bounty disperse transactions for ${disperseInputs.length} tokens:`);

        // Propose transactions using Safe SDK
        let useNonce = undefined;
        for (const input of disperseInputs) {
            const batches = createTxnBatchForBountyDisperse(input);
            for (const batch of batches) {
                console.log(`Proposing batch with nonce ${useNonce}`);
                const nonce = await proposeBatch(batch, false, useNonce);
                useNonce = nonce + 1;
            }
        }

        const message = `🎯 Bounty dispersement proposed

        <@&${MUSIC_DIRECTOR_ID}>
        🔗 [Review & Sign Transactions](<https://app.safe.global/transactions/queue?safe=sonic:${LM_GAUGE_MSIG}>)`;

        sendMessage(message, MSIG_DISCORD_CHANNEL);
    } catch (error) {
        console.error('Error proposing transactions from CSV:', error);
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
