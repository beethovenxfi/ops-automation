// Sonic deployments: https://docs.beets.fi/technicals/deployments
export const DEFAULT_RPC_URL = 'https://rpc.soniclabs.com';
export const BEETS_API_URL = 'https://api.beets-ftm-node.com/graphql';
export const DEFILLAMA_COINS_URL = 'https://coins.llama.fi';

export const VAULT_V2 = '0xBA12222222228d8Ba445958a75a0704d566BF2C8' as const;
export const PROTOCOL_FEES_COLLECTOR_V2 = '0xce88686553686DA562CE7Cea497CE749DA109f9F' as const;
export const VAULT_V3 = '0xbA1333333333a1BA1108E8412f11850A5C319bA9' as const;
export const PROTOCOL_FEE_CONTROLLER_V3 = '0xa731C23D7c95436Baaae9D52782f966E1ed07cc8' as const;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// Max block span per eth_getLogs request. rpc.soniclabs.com accepts >= 1M; keep margin for other providers.
export const LOG_CHUNK_BLOCKS = 500_000n;

// Max distance between a fee event and the DefiLlama price point used for it.
export const MAX_PRICE_AGE_SECONDS = 6 * 3600;
