import * as core from '@actions/core';
import { formatEther, parseEther } from 'viem';
import fs from 'fs';
import { LM_GAUGE_MSIG, MSIG_DISCORD_CHANNEL, MUSIC_DIRECTOR_ID, REVENUE_MSIG } from '../helpers/constants';
import {
    AddRewardTxnInput,
    createTxBatchForBeetsTransfer,
    createTxnBatchForWeeklyRewards,
} from '../helpers/safeCreateJsonBatch';
import { sendMessage } from '../helpers/discord-bot';
import { proposeBatch } from '../helpers/safeProposeJsonBatch';
import { PayloadDataRow, readWeeklyRewardsFromCSV } from '../helpers/csvHelper';

async function run(): Promise<void> {
    try {
        // Skip header and parse data rows
        const dataRows: PayloadDataRow[] = await readWeeklyRewardsFromCSV();

        // Convert CSV data to transaction inputs
        const roundInputs: AddRewardTxnInput[] = dataRows.map((row) => ({
            gaugeAddress: row.gaugeAddress,
            beetsAmountInWei: parseEther(row.beetsAmount),
            addBeetsRewardToken: row.addBeetsRewardToken,
            stSAmountInWei: parseEther(row.stSAmount),
            addStSRewardToken: row.addStSRewardToken,
            fragmentsAmountInWei: parseEther(row.fragmentsAmount),
            addFragmentsRewardToken: row.addFragmentsRewardToken,
        }));

        // Calculate totals for logging
        let totalBeets = 0n;
        let totalStS = 0n;

        for (const input of roundInputs) {
            totalBeets += input.beetsAmountInWei;
            totalStS += input.stSAmountInWei;
        }

        console.log(`Proposing transactions for ${roundInputs.length} gauges:`);
        console.log(`Total BEETS: ${totalBeets.toString()}`);
        console.log(`Total stS: ${totalStS.toString()}`);

        // Propose transactions using Safe SDK
        const batches = createTxnBatchForWeeklyRewards(roundInputs, false);
        let useNonce = undefined;
        for (const batch of batches) {
            const nonce = await proposeBatch(batch, false, useNonce);
            useNonce = nonce + 1;
        }

        // also propose the beets transfer from rev msig to lm msig
        const beetsTransferBatch = createTxBatchForBeetsTransfer(REVENUE_MSIG, LM_GAUGE_MSIG, totalBeets.toString());
        await proposeBatch(beetsTransferBatch[0], true);

        const message = `🎯 Gauge Rewards Proposed

<@&${MUSIC_DIRECTOR_ID}>

** Sending ${formatEther(totalBeets)} BEETS from Revenue Msig to Gauge Msig for distribution **
🔗 [Review, Sign and Exec Transactions](<https://app.safe.global/transactions/queue?safe=sonic:${REVENUE_MSIG}>)

**Rewards:**
• 🍯 ${formatEther(totalBeets)} BEETS
• 🥩 ${formatEther(totalStS)} stS
🔗 [Review & Sign Transactions. Exec after 14:15 UTC](<https://app.safe.global/transactions/queue?safe=sonic:${LM_GAUGE_MSIG}>)`;

        sendMessage(message, MSIG_DISCORD_CHANNEL);
    } catch (error) {
        console.error('Error proposing transactions from CSV:', error);
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
