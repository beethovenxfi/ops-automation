import { parseAbi } from 'viem';

export const vaultV2Abi = parseAbi([
    'event PoolBalanceChanged(bytes32 indexed poolId, address indexed liquidityProvider, address[] tokens, int256[] deltas, uint256[] protocolFeeAmounts)',
    'function getPoolTokens(bytes32 poolId) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)',
    'function getPool(bytes32 poolId) view returns (address pool, uint8 specialization)',
]);

export const erc20Abi = parseAbi([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
]);

export const balancerPoolAbi = parseAbi([
    'function getPoolId() view returns (bytes32)',
    'function getActualSupply() view returns (uint256)',
]);

export const erc4626Abi = parseAbi([
    'function asset() view returns (address)',
    'function convertToAssets(uint256 shares) view returns (uint256)',
]);

export const protocolFeeControllerV3Abi = parseAbi([
    'event ProtocolSwapFeeCollected(address indexed pool, address indexed token, uint256 amount)',
    'event ProtocolYieldFeeCollected(address indexed pool, address indexed token, uint256 amount)',
    'event ProtocolFeesWithdrawn(address indexed pool, address indexed token, address indexed recipient, uint256 amount)',
]);

export const vaultV3Abi = parseAbi([
    'function getPoolTokens(address pool) view returns (address[] tokens)',
    'function getPoolTokenInfo(address pool) view returns (address[] tokens, (uint8 tokenType, address rateProvider, bool paysYieldFees)[] tokenInfo, uint256[] balancesRaw, uint256[] lastBalancesLiveScaled18)',
    'function isPoolRegistered(address pool) view returns (bool)',
]);
