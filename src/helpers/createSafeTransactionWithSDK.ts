import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { MetaTransactionData, OperationType, SafeTransactionDataPartial } from '@safe-global/types-kit';
import { parseEther } from 'viem';
import {
    BEETS_ADDRESS,
    FRAGMENTS_ADDRESS,
    HIDDEN_HAND_MARKET,
    HIDDEN_HAND_VAULT,
    LM_GAUGE_MSIG,
    REVENUE_MSIG,
    SCETH,
    SCUSD,
    STS_ADDRESS,
    VEETH_MARKET,
    VEUSD_MARKET,
} from './constants';
import { parseUnits } from 'ethers';

export interface AddRewardTxnInput {
    gaugeAddress: string;
    beetsAmountInWei: bigint;
    addBeetsRewardToken: boolean;
    stSAmountInWei: bigint;
    addStSRewardToken: boolean;
    fragmentsAmountInWei: bigint;
    addFragmentsRewardToken: boolean;
}

export interface DepositBribeTxnInput {
    proposalHash: string;
    bribeAmountInWei: bigint;
}

export interface SafeSDKConfig {
    chainId: bigint;
    safeAddress: string;
    privateKey: string;
    apiKey?: string;
}

class SafeTransactionProposer {
    private apiKit: SafeApiKit;
    private protocolKit: Safe | null = null;
    private config: SafeSDKConfig;

    constructor(config: SafeSDKConfig) {
        this.config = config;
        this.apiKit = new SafeApiKit({
            chainId: config.chainId,
            ...(config.apiKey && { apiKey: config.apiKey }),
        });
    }

    private async initializeProtocolKit(): Promise<void> {
        if (!this.protocolKit) {
            this.protocolKit = await Safe.init({
                provider: process.env.RPC_URL || 'https://rpc.sonic.fantom.network',
                signer: this.config.privateKey,
                safeAddress: this.config.safeAddress,
            });
        }
    }

    private async proposeTransaction(transactions: MetaTransactionData[], description: string): Promise<string> {
        await this.initializeProtocolKit();

        if (!this.protocolKit) {
            throw new Error('Failed to initialize Protocol Kit');
        }

        const safeTransaction = await this.protocolKit.createTransaction({
            transactions,
        });

        const safeTxHash = await this.protocolKit.getTransactionHash(safeTransaction);
        const signature = await this.protocolKit.signHash(safeTxHash);
        const senderAddress = await this.protocolKit.getSafeProvider().getSignerAddress();

        await this.apiKit.proposeTransaction({
            safeAddress: this.config.safeAddress,
            safeTransactionData: safeTransaction.data,
            safeTxHash,
            senderAddress: senderAddress || '',
            senderSignature: signature.data,
            origin: `gauge-automation: ${description}`,
        });

        console.log(`Transaction proposed successfully. Hash: ${safeTxHash}`);
        return safeTxHash;
    }

    public async proposeHiddenHandBribes(voteId: number, depositBribeInput: DepositBribeTxnInput[]): Promise<string[]> {
        const transactions: MetaTransactionData[] = [];
        let totalAmountOfBeetsBribes = 0n;

        for (const bribeInput of depositBribeInput) {
            totalAmountOfBeetsBribes += bribeInput.bribeAmountInWei;
            transactions.push({
                to: HIDDEN_HAND_MARKET,
                value: '0',
                data: this.encodeDepositBribeData(
                    bribeInput.proposalHash,
                    BEETS_ADDRESS,
                    bribeInput.bribeAmountInWei.toString(),
                    '0',
                    '1',
                ),
                operation: OperationType.Call,
            });
        }

        if (transactions.length === 0) {
            console.log('No gauge deposit bribes transactions found');
            return [];
        }

        const approvalTransaction: MetaTransactionData = {
            to: BEETS_ADDRESS,
            value: '0',
            data: this.encodeApprovalData(HIDDEN_HAND_VAULT, totalAmountOfBeetsBribes.toString()),
            operation: OperationType.Call,
        };

        const allTransactions = [approvalTransaction, ...transactions];
        const txHash = await this.proposeTransaction(
            allTransactions,
            `Deposit bribes for vote ${voteId} on Hidden Hand`,
        );

        return [txHash];
    }

    public async proposeBeetsRewards(addRewardInput: AddRewardTxnInput[]): Promise<string[]> {
        const txHashes: string[] = [];

        const addRewardTokenTxns: MetaTransactionData[] = [];
        const beetsApprovalTxns: MetaTransactionData[] = [];
        const beetsDepositTxns: MetaTransactionData[] = [];
        const stSApprovalTxns: MetaTransactionData[] = [];
        const stSDepositTxns: MetaTransactionData[] = [];
        const fragmentsApprovalTxns: MetaTransactionData[] = [];
        const fragmentsDepositTxns: MetaTransactionData[] = [];

        for (const gaugeInput of addRewardInput) {
            if (gaugeInput.addBeetsRewardToken) {
                addRewardTokenTxns.push(this.generateAddRewardTokenTransaction(gaugeInput.gaugeAddress, BEETS_ADDRESS));
            }

            if (gaugeInput.addStSRewardToken) {
                addRewardTokenTxns.push(this.generateAddRewardTokenTransaction(gaugeInput.gaugeAddress, STS_ADDRESS));
            }

            if (gaugeInput.addFragmentsRewardToken) {
                addRewardTokenTxns.push(
                    this.generateAddRewardTokenTransaction(gaugeInput.gaugeAddress, FRAGMENTS_ADDRESS),
                );
            }

            if (gaugeInput.beetsAmountInWei > 0n) {
                beetsApprovalTxns.push({
                    to: BEETS_ADDRESS,
                    value: '0',
                    data: this.encodeApprovalData(gaugeInput.gaugeAddress, gaugeInput.beetsAmountInWei.toString()),
                    operation: OperationType.Call,
                });

                beetsDepositTxns.push({
                    to: gaugeInput.gaugeAddress,
                    value: '0',
                    data: this.encodeDepositRewardTokenData(BEETS_ADDRESS, gaugeInput.beetsAmountInWei.toString()),
                    operation: OperationType.Call,
                });
            }

            if (gaugeInput.stSAmountInWei > 0n) {
                stSApprovalTxns.push({
                    to: STS_ADDRESS,
                    value: '0',
                    data: this.encodeApprovalData(gaugeInput.gaugeAddress, gaugeInput.stSAmountInWei.toString()),
                    operation: OperationType.Call,
                });

                stSDepositTxns.push({
                    to: gaugeInput.gaugeAddress,
                    value: '0',
                    data: this.encodeDepositRewardTokenData(STS_ADDRESS, gaugeInput.stSAmountInWei.toString()),
                    operation: OperationType.Call,
                });
            }

            if (gaugeInput.fragmentsAmountInWei > 0n) {
                fragmentsApprovalTxns.push({
                    to: FRAGMENTS_ADDRESS,
                    value: '0',
                    data: this.encodeApprovalData(gaugeInput.gaugeAddress, gaugeInput.fragmentsAmountInWei.toString()),
                    operation: OperationType.Call,
                });

                fragmentsDepositTxns.push({
                    to: gaugeInput.gaugeAddress,
                    value: '0',
                    data: this.encodeDepositRewardTokenData(
                        FRAGMENTS_ADDRESS,
                        gaugeInput.fragmentsAmountInWei.toString(),
                    ),
                    operation: OperationType.Call,
                });
            }
        }

        if (addRewardTokenTxns.length > 0) {
            const txHash = await this.proposeTransaction(addRewardTokenTxns, 'Add reward tokens to gauges');
            txHashes.push(txHash);
        }

        if (beetsApprovalTxns.length > 0) {
            const approvalTxHash = await this.proposeTransaction(beetsApprovalTxns, 'Approve BEETS for gauges');
            txHashes.push(approvalTxHash);

            const depositTxHash = await this.proposeTransaction(beetsDepositTxns, 'Deposit BEETS rewards to gauges');
            txHashes.push(depositTxHash);
        }

        if (stSApprovalTxns.length > 0) {
            const approvalTxHash = await this.proposeTransaction(stSApprovalTxns, 'Approve stS for gauges');
            txHashes.push(approvalTxHash);

            const depositTxHash = await this.proposeTransaction(stSDepositTxns, 'Deposit stS rewards to gauges');
            txHashes.push(depositTxHash);
        }

        if (fragmentsApprovalTxns.length > 0) {
            const approvalTxHash = await this.proposeTransaction(fragmentsApprovalTxns, 'Approve fragments for gauges');
            txHashes.push(approvalTxHash);

            const depositTxHash = await this.proposeTransaction(
                fragmentsDepositTxns,
                'Deposit fragments rewards to gauges',
            );
            txHashes.push(depositTxHash);
        }

        return txHashes;
    }

    public async proposeTreveeBounty(
        amountUsd: string,
        minRewardPerVoteUsd: string,
        maxRewardPerVoteUsd: string,
        amountEth: string,
        minRewardPerVoteEth: string,
        maxRewardPerVoteEth: string,
    ): Promise<string> {
        const bountyAmountUsdInWei = parseUnits(amountUsd, 6);
        const minRewardPerVoteUsdInWei = parseUnits(minRewardPerVoteUsd, 6);
        const maxRewardPerVoteUsdInWei = parseUnits(maxRewardPerVoteUsd, 6);
        const feeAmountUsdInWei = (bountyAmountUsdInWei * 4n) / 100n;
        const totalAmountUsdInWei = bountyAmountUsdInWei + feeAmountUsdInWei;

        const bountyAmountEthInWei = parseEther(amountEth);
        const minRewardPerVoteEthInWei = parseEther(minRewardPerVoteEth);
        const maxRewardPerVoteEthInWei = parseEther(maxRewardPerVoteEth);
        const feeAmountEthInWei = (bountyAmountEthInWei * 4n) / 100n;
        const totalAmountEthInWei = bountyAmountEthInWei + feeAmountEthInWei;

        const transactions: MetaTransactionData[] = [
            {
                to: SCUSD,
                value: '0',
                data: this.encodeApprovalData(VEUSD_MARKET, totalAmountUsdInWei.toString()),
                operation: OperationType.Call,
            },
            {
                to: SCETH,
                value: '0',
                data: this.encodeApprovalData(VEETH_MARKET, totalAmountEthInWei.toString()),
                operation: OperationType.Call,
            },
            {
                to: VEUSD_MARKET,
                value: '0',
                data: this.encodeCreateRangedQuestData(
                    '0xc5E0250037195850E4D987CA25d6ABa68ef5fEe8',
                    SCUSD,
                    false,
                    1,
                    minRewardPerVoteUsdInWei.toString(),
                    maxRewardPerVoteUsdInWei.toString(),
                    bountyAmountUsdInWei.toString(),
                    feeAmountUsdInWei.toString(),
                    0,
                    0,
                    [],
                ),
                operation: OperationType.Call,
            },
            {
                to: VEETH_MARKET,
                value: '0',
                data: this.encodeCreateRangedQuestData(
                    '0xc5E0250037195850E4D987CA25d6ABa68ef5fEe8',
                    SCETH,
                    false,
                    1,
                    minRewardPerVoteEthInWei.toString(),
                    maxRewardPerVoteEthInWei.toString(),
                    bountyAmountEthInWei.toString(),
                    feeAmountEthInWei.toString(),
                    0,
                    0,
                    [],
                ),
                operation: OperationType.Call,
            },
        ];

        return await this.proposeTransaction(transactions, 'Add bounty for Trevee');
    }

    private generateAddRewardTokenTransaction(gaugeAddress: string, rewardTokenAddress: string): MetaTransactionData {
        return {
            to: gaugeAddress,
            value: '0',
            data: this.encodeAddRewardData(rewardTokenAddress, LM_GAUGE_MSIG),
            operation: OperationType.Call,
        };
    }

    private encodeApprovalData(spender: string, amount: string): string {
        const iface = new (require('ethers').Interface)([
            'function approve(address spender, uint256 amount) returns (bool)',
        ]);
        return iface.encodeFunctionData('approve', [spender, amount]);
    }

    private encodeDepositRewardTokenData(rewardToken: string, amount: string): string {
        const iface = new (require('ethers').Interface)([
            'function deposit_reward_token(address _reward_token, uint256 _amount)',
        ]);
        return iface.encodeFunctionData('deposit_reward_token', [rewardToken, amount]);
    }

    private encodeAddRewardData(rewardToken: string, distributor: string): string {
        const iface = new (require('ethers').Interface)([
            'function add_reward(address _reward_token, address _distributor)',
        ]);
        return iface.encodeFunctionData('add_reward', [rewardToken, distributor]);
    }

    private encodeDepositBribeData(
        proposal: string,
        token: string,
        amount: string,
        maxTokensPerVote: string,
        periods: string,
    ): string {
        const iface = new (require('ethers').Interface)([
            'function depositBribe(bytes32 _proposal, address _token, uint256 _amount, uint256 _maxTokensPerVote, uint256 _periods)',
        ]);
        return iface.encodeFunctionData('depositBribe', [proposal, token, amount, maxTokensPerVote, periods]);
    }

    private encodeCreateRangedQuestData(
        gauge: string,
        rewardToken: string,
        startNextPeriod: boolean,
        duration: number,
        minRewardPerVote: string,
        maxRewardPerVote: string,
        totalRewardAmount: string,
        feeAmount: string,
        voteType: number,
        closeType: number,
        voterList: number[],
    ): string {
        const iface = new (require('ethers').Interface)([
            'function createRangedQuest(address gauge, address rewardToken, bool startNextPeriod, uint48 duration, uint256 minRewardPerVote, uint256 maxRewardPerVote, uint256 totalRewardAmount, uint256 feeAmount, uint8 voteType, uint8 closeType, uint256[] voterList)',
        ]);
        return iface.encodeFunctionData('createRangedQuest', [
            gauge,
            rewardToken,
            startNextPeriod,
            duration,
            minRewardPerVote,
            maxRewardPerVote,
            totalRewardAmount,
            feeAmount,
            voteType,
            closeType,
            voterList,
        ]);
    }
}

export async function proposeHiddenHandBribesWithSDK(
    voteId: number,
    depositBribeInput: DepositBribeTxnInput[],
): Promise<string[]> {
    const config: SafeSDKConfig = {
        chainId: 146n, // Sonic chain ID
        safeAddress: REVENUE_MSIG,
        privateKey: process.env.PRIVATE_KEY || '',
        apiKey: process.env.SAFE_API_KEY,
    };

    const proposer = new SafeTransactionProposer(config);
    return await proposer.proposeHiddenHandBribes(voteId, depositBribeInput);
}

export async function proposeBeetsRewardsWithSDK(addRewardInput: AddRewardTxnInput[]): Promise<string[]> {
    const config: SafeSDKConfig = {
        chainId: 146n, // Sonic chain ID
        safeAddress: LM_GAUGE_MSIG,
        privateKey: process.env.PRIVATE_KEY || '',
        apiKey: process.env.SAFE_API_KEY,
    };

    const proposer = new SafeTransactionProposer(config);
    return await proposer.proposeBeetsRewards(addRewardInput);
}

export async function proposeTreveeBountyWithSDK(
    amountUsd: string,
    minRewardPerVoteUsd: string,
    maxRewardPerVoteUsd: string,
    amountEth: string,
    minRewardPerVoteEth: string,
    maxRewardPerVoteEth: string,
): Promise<string> {
    const config: SafeSDKConfig = {
        chainId: 146n, // Sonic chain ID
        safeAddress: LM_GAUGE_MSIG,
        privateKey: process.env.PRIVATE_KEY || '',
        apiKey: process.env.SAFE_API_KEY,
    };

    const proposer = new SafeTransactionProposer(config);
    return await proposer.proposeTreveeBounty(
        amountUsd,
        minRewardPerVoteUsd,
        maxRewardPerVoteUsd,
        amountEth,
        minRewardPerVoteEth,
        maxRewardPerVoteEth,
    );
}
