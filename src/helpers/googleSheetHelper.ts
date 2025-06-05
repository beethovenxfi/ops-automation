import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { SHEET_ID, SHEET_RANGE, SHEET_TAB_NAME } from './constants';

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
            range: `${SHEET_TAB_NAME}${SHEET_RANGE}`,
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
            range: `${SHEET_TAB_NAME}${SHEET_RANGE}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                majorDimension: 'ROWS',
                range: `${SHEET_TAB_NAME}${SHEET_RANGE}`,
                values: data.map((row) => mapGaugeDataToGoogleSheetRow(row)),
            },
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
        await jwtClient.authorize(function (err, result) {
            if (err) {
                console.log(`Error authorizing google jwt client: ${err}`);
            }
        });
        return jwtClient;
    }
}
