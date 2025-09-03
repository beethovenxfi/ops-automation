import * as core from '@actions/core';
import { formatEther, parseEther } from 'viem';
import fs from 'fs';
import {
    GAUGE_REWARD_CSV_PATH,
    LM_GAUGE_MSIG,
    MSIG_DISCORD_CHANNEL,
    MUSIC_DIRECTOR_ID,
    REVENUE_MSIG,
} from '../helpers/constants';
import {
    AddRewardTxnInput,
    createTxBatchForBeetsTransfer,
    createTxnBatchForWeeklyRewards,
} from '../helpers/safeCreateJsonBatch';
import { sendMessage } from '../helpers/discord-bot';
import { proposeBatch } from '../helpers/safeProposeJsonBatch';

interface PayloadDataRow {
    poolId: string;
    poolTokenName: string;
    gaugeAddress: string;
    beetsAmount: string;
    stSAmount: string;
    fragmentsAmount: string;
    addBeetsRewardToken: boolean;
    addStSRewardToken: boolean;
    addFragmentsRewardToken: boolean;
}

function parseCsvLine(line: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);

    return result;
}

function parseCsvRow(csvLine: string): PayloadDataRow {
    const fields = parseCsvLine(csvLine);

    return {
        poolId: fields[0],
        poolTokenName: fields[1],
        gaugeAddress: fields[2],
        beetsAmount: fields[3],
        stSAmount: fields[4],
        fragmentsAmount: fields[5],
        addBeetsRewardToken: fields[6].toLowerCase() === 'true',
        addStSRewardToken: fields[7].toLowerCase() === 'true',
        addFragmentsRewardToken: fields[8].toLowerCase() === 'true',
    };
}

async function run(): Promise<void> {
    try {
        const csvPath = GAUGE_REWARD_CSV_PATH;

        if (!fs.existsSync(csvPath)) {
            core.setFailed(`CSV file not found: ${csvPath}`);
            return;
        }

        console.log(`Reading payload data from: ${csvPath}`);

        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.trim().split('\n');

        if (lines.length < 2) {
            core.setFailed('CSV file is empty or only contains header');
            return;
        }

        // Skip header and parse data rows
        const dataRows: PayloadDataRow[] = lines.slice(1).map((line) => parseCsvRow(line));

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
        // const batches = createTxnBatchForWeeklyRewards(roundInputs, false);
        // let useNonce = undefined;
        // for (const batch of batches) {
        //     // Propose each batch using Safe SDK
        //     const nonce = await proposeBatch(batch, useNonce);
        //     useNonce = nonce + 1;
        // }

        // also propose the beets transfer from rev msig to lm msig
        const beetsTransferBatch = createTxBatchForBeetsTransfer(REVENUE_MSIG, LM_GAUGE_MSIG, totalBeets.toString());
        await proposeBatch(beetsTransferBatch[0]);

        const message = `🎯 Gauge Rewards Proposed

<@&${MUSIC_DIRECTOR_ID}>

**Rewards:**
• 🍯 ${formatEther(totalBeets)} BEETS
• 🥩 ${formatEther(totalStS)} stS
🔗 [Review & Sign Transactions. Exec after 14:15 UTC](<https://app.safe.global/transactions/queue?safe=sonic:${LM_GAUGE_MSIG}>)


** Sending ${formatEther(totalBeets)} BEETS from Revenue Msig to Gauge Msig for distribution **
🔗 [Review, Sign and Exec Transactions](<https://app.safe.global/transactions/queue?safe=sonic:${REVENUE_MSIG}>)`;

        sendMessage(message, MSIG_DISCORD_CHANNEL);
    } catch (error) {
        console.error('Error proposing transactions from CSV:', error);
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
