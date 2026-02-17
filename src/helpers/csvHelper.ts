import fs from 'fs';
import path from 'path';
import { GAUGE_REWARD_CSV_PATH, VOTE_WEIGHTS_CSV_PATH } from '../helpers/constants';

export interface PayloadDataRow {
    poolId: string;
    poolTokenName: string;
    gaugeAddress: string;
    beetsAmount: string;
    stSAmount: string;
    fragmentsAmount: string;
    addBeetsRewardToken: boolean;
    addStSRewardToken: boolean;
    addFragmentsRewardToken: boolean;
    hasWrongDistributor: boolean;
}

export interface VoteWeightsDataRow {
    poolName: string;
    voterAddress: string;
    absoluteVotes: string;
    shareVote: string;
}

export async function readVoteWeightsFromCSV(): Promise<VoteWeightsDataRow[]> {
    if (!fs.existsSync(VOTE_WEIGHTS_CSV_PATH)) {
        throw new Error(`CSV file not found: ${VOTE_WEIGHTS_CSV_PATH}`);
    }

    console.log(`Reading vote weights data from: ${VOTE_WEIGHTS_CSV_PATH}`);
    const csvContent = fs.readFileSync(VOTE_WEIGHTS_CSV_PATH, 'utf-8');
    const lines = csvContent.trim().split('\n');

    if (lines.length < 2) {
        throw new Error('CSV file is empty or only contains header');
    }

    // Skip header and parse data rows
    const dataRows: VoteWeightsDataRow[] = lines.slice(1).map((line) => parseVoteWeightsCsvRow(line));
    console.log(`Parsed ${dataRows.length} vote weights entries from CSV`);
    return dataRows;
}

export async function generateWeeklyRewardCSV(csvData: PayloadDataRow[]): Promise<void> {
    // Create CSV content
    const csvHeader =
        'poolId,gaugeAddress,poolTokenName,beetsAmount,stSAmount,fragmentsAmount,addBeetsRewardToken,addStSRewardToken,addFragmentsRewardToken,hasWrongDistributor\n';
    const csvContent = csvData
        .map(
            (row) =>
                `${row.poolId},${row.gaugeAddress},${row.poolTokenName},${row.beetsAmount},${row.stSAmount},${row.fragmentsAmount},${row.addBeetsRewardToken},${row.addStSRewardToken},${row.addFragmentsRewardToken},${row.hasWrongDistributor}`,
        )
        .join('\n');

    // Write CSV file
    const csvPath = GAUGE_REWARD_CSV_PATH;

    // Ensure directory exists
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });

    fs.writeFileSync(csvPath, csvHeader + csvContent);
    console.log(`Generated payload data CSV: ${csvPath}`);
}

export async function readWeeklyRewardsFromCSV(): Promise<PayloadDataRow[]> {
    if (!fs.existsSync(GAUGE_REWARD_CSV_PATH)) {
        throw new Error(`CSV file not found: ${GAUGE_REWARD_CSV_PATH}`);
    }

    console.log(`Reading payload data from: ${GAUGE_REWARD_CSV_PATH}`);

    const csvContent = fs.readFileSync(GAUGE_REWARD_CSV_PATH, 'utf-8');
    const lines = csvContent.trim().split('\n');

    if (lines.length < 2) {
        throw new Error('CSV file is empty or only contains header');
    }

    // Skip header and parse data rows
    const dataRows: PayloadDataRow[] = lines.slice(1).map((line) => parseGaugeRewardCsvRow(line));
    return dataRows;
}

function parseGaugeRewardCsvRow(csvLine: string): PayloadDataRow {
    const fields = parseCsvLine(csvLine);

    return {
        poolId: fields[0],
        gaugeAddress: fields[1],
        poolTokenName: fields[2],
        beetsAmount: fields[3],
        stSAmount: fields[4],
        fragmentsAmount: fields[5],
        addBeetsRewardToken: fields[6].toLowerCase() === 'true',
        addStSRewardToken: fields[7].toLowerCase() === 'true',
        addFragmentsRewardToken: fields[8].toLowerCase() === 'true',
        hasWrongDistributor: fields[9].toLowerCase() === 'true',
    };
}

function parseVoteWeightsCsvRow(csvLine: string): VoteWeightsDataRow {
    const fields = parseCsvLine(csvLine);

    return {
        poolName: fields[0],
        voterAddress: fields[1],
        absoluteVotes: fields[2],
        shareVote: fields[3],
    };
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
