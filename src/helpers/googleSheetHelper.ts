import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import {
    SHEET_ID,
    SHEET_RANGE_BOUNTIES,
    SHEET_RANGE_EMISSION,
    SHEET_RANGE_POOL_FEES,
    SHEET_TAB_NAME_BOUNTIES,
    SHEET_TAB_NAME_EMISSION,
    SHEET_TAB_NAME_POOL_FEES,
} from './constants';

export type GaugeData = {
    poolId: string;
    poolName: string;
    poolTokenName: string;
    snapshot: boolean;
    protocolBounties: string;
    gaugeBeets: string;
    extraBeets: string;
    sitmiRewards: string;
    extraStSRewards: string;
    fragmentsRewards: string;
};

export type BountyData = {
    poolTokenName: string;
    bountyTokenName: string;
    bountyTokenAddress: string;
    bountyTokenDecimals: string;
    bountyAmount: string;
};

function mapGoogleSheetRowToBountyData(row: string[]): BountyData {
    return {
        poolTokenName: row[0],
        bountyTokenName: row[1],
        bountyAmount: row[2],
        bountyTokenDecimals: row[3],
        bountyTokenAddress: row[4],
    };
}

function mapGoogleSheetRowToGaugeData(row: string[]): GaugeData {
    return {
        poolId: row[0].toLowerCase(),
        poolName: row[1],
        poolTokenName: row[2],
        snapshot: row[3] === 'x',
        protocolBounties: row[4]?.toString() || '0',
        gaugeBeets: row[5]?.toString() || '0',
        extraBeets: row[6]?.toString() || '0',
        sitmiRewards: row[7]?.toString() || '0',
        extraStSRewards: row[8]?.toString() || '0',
        fragmentsRewards: row[9]?.toString() || '0',
    };
}

function mapGaugeDataToGoogleSheetRow(row: GaugeData): string[] {
    return [
        row.poolId,
        row.poolName,
        row.poolTokenName,
        row.snapshot ? 'x' : '',
        row.protocolBounties,
        row.gaugeBeets,
        row.extraBeets,
        row.sitmiRewards,
        row.extraStSRewards,
        row.fragmentsRewards,
    ];
}

export async function readBountiesFromGoogleSheet(): Promise<BountyData[]> {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Missing required environment variables to read sheets');
    }
    const googleJwtClient = new GoogleJwtClient();

    const jwtClient = await googleJwtClient.getAuthorizedSheetsClient(
        process.env.GOOGLE_CLIENT_EMAIL,
        process.env.GOOGLE_PRIVATE_KEY,
    );
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    let result;
    try {
        result = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_TAB_NAME_BOUNTIES}${SHEET_RANGE_BOUNTIES}`,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
    } catch (e) {
        throw Error('Could not read sheet.');
    }

    return result.data.values?.map((row: string[]) => mapGoogleSheetRowToBountyData(row)) || [];
}

export async function readGaugeDataFromGoogleSheet(): Promise<GaugeData[]> {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Missing required environment variables to read sheets');
    }

    const googleJwtClient = new GoogleJwtClient();

    const jwtClient = await googleJwtClient.getAuthorizedSheetsClient(
        process.env.GOOGLE_CLIENT_EMAIL,
        process.env.GOOGLE_PRIVATE_KEY,
    );

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    let result;
    try {
        result = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_TAB_NAME_EMISSION}${SHEET_RANGE_EMISSION}`,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
    } catch (e) {
        throw Error('Could not read sheet.');
    }

    return result.data.values?.map((row: string[]) => mapGoogleSheetRowToGaugeData(row)) || [];
}

export async function writeGaugeDataToGoogleSheet(data: GaugeData[]): Promise<void> {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Missing required environment variables to write sheets');
    }

    const googleJwtClient = new GoogleJwtClient();

    const jwtClient = await googleJwtClient.getAuthorizedSheetsClient(
        process.env.GOOGLE_CLIENT_EMAIL,
        process.env.GOOGLE_PRIVATE_KEY,
    );

    const service = google.sheets({ version: 'v4', auth: jwtClient });

    let result;
    try {
        result = await service.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_TAB_NAME_EMISSION}${SHEET_RANGE_EMISSION}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                majorDimension: 'ROWS',
                range: `${SHEET_TAB_NAME_EMISSION}${SHEET_RANGE_EMISSION}`,
                values: data.map((row) => mapGaugeDataToGoogleSheetRow(row)),
            },
        });
    } catch (e) {
        throw Error('Could not write sheet.');
    }
}

export type PoolFeesRow = {
    poolId: string;
    poolName: string | null;
    poolTokenName: string | null;
    feeUsd: number;
    sharePct: number;
};

async function getSheetsService() {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Missing required environment variables to access sheets');
    }
    const googleJwtClient = new GoogleJwtClient();
    const jwtClient = await googleJwtClient.getAuthorizedSheetsClient(
        process.env.GOOGLE_CLIENT_EMAIL,
        process.env.GOOGLE_PRIVATE_KEY,
    );
    return google.sheets({ version: 'v4', auth: jwtClient });
}

/** Finds the "Pool Fees" tab (case-insensitive) and returns its exact title for use in ranges. */
async function findPoolFeesTabTitle(service: ReturnType<typeof google.sheets>): Promise<string> {
    const meta = await service.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' });
    const titles = (meta.data.sheets || []).map((s) => s.properties?.title || '');
    const match = titles.find((t) => t.trim().toLowerCase() === SHEET_TAB_NAME_POOL_FEES.toLowerCase());
    if (!match) {
        throw new Error(`Tab "${SHEET_TAB_NAME_POOL_FEES}" not found in sheet. Tabs: ${titles.join(', ')}`);
    }
    return match;
}

/** Pool ids from column A of the "Pool Fees" tab, in sheet order (empty rows skipped). */
export async function readPoolFeesPoolIdsFromGoogleSheet(): Promise<string[]> {
    const service = await getSheetsService();
    const tab = await findPoolFeesTabTitle(service);
    const result = await service.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${tab}'${SHEET_RANGE_POOL_FEES}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rows = (result.data.values || []) as (string | number)[][];
    return rows
        .map((row) => String(row[0] ?? '').trim())
        .filter((id) => /^0x[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/.test(id))
        .map((id) => id.toLowerCase());
}

/**
 * Writes into the "Pool Fees" tab, matched by pool id (column A, left untouched):
 *   B "Pool Name" and C "Token Name" are only filled when empty in the sheet,
 *   D "Fee in USD" and E "Percentage of contribution" (0-100) are always written.
 */
export async function writePoolFeesToGoogleSheet(data: PoolFeesRow[]): Promise<void> {
    const service = await getSheetsService();
    const tab = await findPoolFeesTabTitle(service);
    const existing = await service.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${tab}'${SHEET_RANGE_POOL_FEES}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const sheetRows = (existing.data.values || []) as (string | number)[][];
    const byPoolId = new Map(data.map((d) => [d.poolId.toLowerCase(), d]));

    const values: (string | number)[][] = sheetRows.map((row) => {
        const id = String(row[0] ?? '')
            .trim()
            .toLowerCase();
        const d = byPoolId.get(id);
        if (!d) return [row[1] ?? '', row[2] ?? '', row[3] ?? '', row[4] ?? ''];
        byPoolId.delete(id);
        const poolName = String(row[1] ?? '').trim() || d.poolName || '';
        const tokenName = String(row[2] ?? '').trim() || d.poolTokenName || '';
        return [poolName, tokenName, Number(d.feeUsd.toFixed(6)), Number(d.sharePct.toFixed(4))];
    });
    if (byPoolId.size > 0) {
        throw new Error(`Pools not found in sheet: ${Array.from(byPoolId.keys()).join(', ')}`);
    }
    if (values.length === 0) return;

    const range = `'${tab}'!B2:E${values.length + 1}`;
    try {
        await service.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: { majorDimension: 'ROWS', range, values },
        });
    } catch (e) {
        throw Error('Could not write sheet.');
    }
}

class GoogleJwtClient {
    public async getAuthorizedSheetsClient(user: string, privateKey: string): Promise<JWT> {
        const jwtClient = new google.auth.JWT(
            user,
            undefined,
            privateKey,
            'https://www.googleapis.com/auth/spreadsheets',
        );
        try {
            await jwtClient.authorize();
        } catch (err) {
            console.error('Error authorizing google jwt client:', err);
            throw err;
        }
        return jwtClient;
    }
}
