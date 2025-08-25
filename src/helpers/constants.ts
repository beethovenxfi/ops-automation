import path from 'path';

export const FIRST_GAUGE_VOTE_DAY = '2025-01-16';

export const TWO_WEEKS_IN_SECONDS = 60 * 60 * 24 * 14;
export const DAYS_DELTA_BETWEEN_VOTE_END_AND_EMISSION_START = 2;
export const DAYS_FOR_EMISSIONS = 13;

export const VOTE_START_HOUR_UTC = 20;
export const VOTE_END_HOUR_UTC = 8;

// export const SNAPSHOT_HUB_URL = 'https://testnet.hub.snapshot.org';
// export const SNAPSHOT_SPACE = 'beets-test.eth';
export const SNAPSHOT_HUB_URL = 'https://hub.snapshot.org';
export const SNAPSHOT_SPACE = 'beets-gauges.eth';

export const GAUGE_FACTORY = '0xE6338D702941998102Fc4D7550A36EA9E833bd7C';

export const BEETS_ADDRESS = '0x2d0e0814e62d80056181f5cd932274405966e4f0';
export const STS_ADDRESS = '0xe5da20f15420ad15de0fa650600afc998bbe3955';
export const FRAGMENTS_ADDRESS = '0x3419966bc74fa8f951108d15b053bed233974d3d';

export const REVENUE_MSIG = '0x26377CAB961c84F2d7b9d9e36D296a1C1c77C995';
export const LM_GAUGE_MSIG = '0x97079F7E04B535FE7cD3f972Ce558412dFb33946';
export const TREASURY_MSIG = '0xc5E0250037195850E4D987CA25d6ABa68ef5fEe8';
export const TEST_PROPOSE_MSIG = '0xC4439cCeBF75C2fcb01571d9C3f229a85fD9aaCC'; // test safe

export const PROTOCOL_FEE_CONTROLLER = '0xa731C23D7c95436Baaae9D52782f966E1ed07cc8';

export const SHEET_ID = '1FHFsdX6LVIYcXGPXIFEy5LoDizqbAo6V8ShDCFmWXEE';
export const SHEET_TAB_NAME = 'Emissions';
export const SHEET_RANGE = '!A2:J';

export const HIDDEN_HAND_VAULT = '0x1Fbb3041B086d5AEb4905a6cf087f57e6fA87CBf';
export const HIDDEN_HAND_MARKET = '0x2A537a574a329E0f00E36F876fda03E66F4dB355';

export const VEUSD_MARKET = '0xA04A36614e4C1Eb8cc0137d6d34eaAc963167828';
export const VEETH_MARKET = '0xc20824bEd473525bA640f6c2Ae5D89469636DDCb';

export const SCUSD = '0xd3DCe716f3eF535C5Ff8d041c1A41C3bd89b97aE';
export const SCETH = '0x3bcE5CB273F0F148010BbEa2470e7b5df84C7812';

export const GAUGE_REWARD_CSV_PATH = path.join('src', 'gaugeAutomation', 'review-data', `gauge-rewards.csv`);
