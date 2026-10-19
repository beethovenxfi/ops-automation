import * as core from '@actions/core';
import path from 'path';
import { calculateProtocolFees } from './lib/calc';
import { buildMarkdownReport, writeReportFiles } from './lib/report';
import { PROTOCOL_FEES_DATA_PATH } from '../helpers/constants';
import {
    PoolFeesRow,
    readPoolFeesPoolIdsFromGoogleSheet,
    writePoolFeesToGoogleSheet,
} from '../helpers/googleSheetHelper';

function parseDay(value: string | undefined, name: string): number {
    if (!value) throw new Error(`Missing required environment variable ${name} (YYYY-MM-DD)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be YYYY-MM-DD, got "${value}"`);
    const ts = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(ts)) throw new Error(`${name} is not a valid date: "${value}"`);
    return Math.floor(ts / 1000);
}

async function run(): Promise<void> {
    try {
        const startDay = process.env.START_DATE;
        const endDay = process.env.END_DATE;
        const start = parseDay(startDay, 'START_DATE');
        const end = parseDay(endDay, 'END_DATE');
        if (end <= start) throw new Error('END_DATE must be after START_DATE');

        // Pool ids come from the "Pool Fees" tab of the google sheet (column A). POOL_IDS env is a local-testing override.
        let poolIds: string[];
        if (process.env.POOL_IDS) {
            poolIds = process.env.POOL_IDS.split(/[\s,]+/).filter((s) => s.length > 0);
            console.log(`Using ${poolIds.length} pool ids from POOL_IDS env`);
        } else {
            poolIds = await readPoolFeesPoolIdsFromGoogleSheet();
            console.log(`Read ${poolIds.length} pool ids from the google sheet`);
        }
        if (poolIds.length === 0) throw new Error('No pool ids found');

        const result = await calculateProtocolFees({ poolIds, start, end, log: (m) => console.log(m) });

        const outDir = path.join(PROTOCOL_FEES_DATA_PATH, `${startDay}_${endDay}`);
        writeReportFiles(result, outDir, startDay!, endDay!);
        console.log(`Wrote report files to ${outDir}`);

        const md = buildMarkdownReport(result, startDay!, endDay!);
        console.log(md);
        if (process.env.GITHUB_STEP_SUMMARY) await core.summary.addRaw(md).write();

        const rows: PoolFeesRow[] = result.pools.map((p) => ({
            poolId: p.poolId,
            feeUsd: p.usd,
            sharePct: p.sharePct,
        }));
        if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            await writePoolFeesToGoogleSheet(rows);
            console.log(`Wrote ${rows.length} rows to the google sheet`);
        } else {
            console.log('GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY not set, skipping google sheet update');
        }

        if (result.warnings.length) {
            core.warning(`${result.warnings.length} warning(s), see report.md`);
        }
    } catch (error) {
        console.log(`error calculating protocol fees: `, error);
        core.setFailed(error as Error);
    }
}

run();
