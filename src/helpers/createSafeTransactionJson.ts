import fs from 'fs';
import moment from 'moment';
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
import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';
import { OperationType, SafeTransaction } from '@safe-global/types-kit';

interface SafeTransactionBatch {
    version: string;
    chainId: string;
    createdAt: number;
    meta: Meta;
    transactions: Transaction[];
}

interface Meta {
    name: string;
    description: string;
    txBuilderVersion: string;
    createdFromSafeAddress: string;
    createdFromOwnerAddress: string;
    checksum: string;
}

interface Transaction {
    to: string;
    value: string;
    data: any;
    contractMethod: ContractMethod;
    contractInputsValues: ContractInputsValues;
}

interface ContractMethod {
    inputs: Input[];
    name: string;
    payable: boolean;
}

interface Input {
    name: string;
    type: string;
    internalType?: string;
}

export interface ContractInputsValues {
    spender?: string;
    amount?: string;
    _reward_token?: string;
    _distributor?: string;
    _amount?: string;
    _proposal?: string;
    _token?: string;
    _maxTokensPerVote?: string;
    _periods?: string;
    gauge?: string;
    rewardToken?: string;
    startNextPeriod?: string;
    duration?: string;
    minRewardPerVote?: string;
    maxRewardPerVote?: string;
    totalRewardAmount?: string;
    feeAmount?: string;
    voterList?: string;
    voteType?: string;
    closeType?: string;
}

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

export async function createTxnBatchForHiddenHandBribes(voteId: number, depositBribeInput: DepositBribeTxnInput[]) {
    const gaugeBribeDepositTxns: Transaction[] = [];
    let totalAmountOfBeetsBribes = 0n;

    for (const bribeInput of depositBribeInput) {
        totalAmountOfBeetsBribes += bribeInput.bribeAmountInWei;
        gaugeBribeDepositTxns.push({
            to: HIDDEN_HAND_MARKET,
            value: '0',
            data: null,
            contractMethod: {
                inputs: [
                    { name: '_proposal', type: 'bytes32' },
                    { name: '_token', type: 'address' },
                    { name: '_amount', type: 'uint256' },
                    { name: '_maxTokensPerVote', type: 'uint256' },
                    { name: '_periods', type: 'uint256' },
                ],
                name: 'depositBribe',
                payable: false,
            },
            contractInputsValues: {
                _proposal: bribeInput.proposalHash,
                _token: BEETS_ADDRESS, // Assuming BEETS is the token used for bribes
                _amount: bribeInput.bribeAmountInWei.toString(),
                _maxTokensPerVote: '0',
                _periods: '1',
            },
        });
    }

    const approveTxn = generateTokenApprovalInput(
        HIDDEN_HAND_VAULT,
        BEETS_ADDRESS,
        totalAmountOfBeetsBribes.toString(),
    );

    if (gaugeBribeDepositTxns.length > 0) {
        const transactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Deposit bribes for gauges on Hidden Hand',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: REVENUE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: [approveTxn, ...gaugeBribeDepositTxns],
        };

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/deposit-bribes-${voteId}.json`,
            JSON.stringify(transactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
    } else {
        console.log(`No gauge deposit bribes transactions found`);
    }
}

export function createTxnBatchForWeeklyRewards(
    addRewardInput: AddRewardTxnInput[],
    saveTransactionJson = true,
): SafeTransactionBatch[] {
    const batchId = moment().unix(); // Using current timestamp as voteId, can be replaced with a specific vote ID if needed
    const allTransactionBatches: SafeTransactionBatch[] = [];
    let gaugeAddMissingRewardTokensTxns: Transaction[] = [];
    let gaugeBeetsApprovalTxns: Transaction[] = [];
    let gaugeBeetsDepositTxns: Transaction[] = [];
    let gaugeStSApprovalTxns: Transaction[] = [];
    let gaugeStSDepositTxns: Transaction[] = [];

    for (const gaugeInput of addRewardInput) {
        if (gaugeInput.addBeetsRewardToken) {
            gaugeAddMissingRewardTokensTxns.push(generateAddRewardTokenInput(gaugeInput.gaugeAddress, BEETS_ADDRESS));
        }

        if (gaugeInput.addStSRewardToken) {
            gaugeAddMissingRewardTokensTxns.push(generateAddRewardTokenInput(gaugeInput.gaugeAddress, STS_ADDRESS));
        }

        if (gaugeInput.addFragmentsRewardToken) {
            gaugeAddMissingRewardTokensTxns.push(
                generateAddRewardTokenInput(gaugeInput.gaugeAddress, FRAGMENTS_ADDRESS),
            );
        }

        if (gaugeInput.beetsAmountInWei > 0n) {
            // add the approve transcation
            gaugeBeetsApprovalTxns.push(
                generateTokenApprovalInput(
                    gaugeInput.gaugeAddress,
                    BEETS_ADDRESS,
                    gaugeInput.beetsAmountInWei.toString(),
                ),
            );

            // add deposit_reward_token transaction
            gaugeBeetsDepositTxns.push(
                generateRewardTokenDepositInput(
                    gaugeInput.gaugeAddress,
                    BEETS_ADDRESS,
                    gaugeInput.beetsAmountInWei.toString(),
                ),
            );
        }

        if (gaugeInput.stSAmountInWei > 0n) {
            // add the approve transcation
            gaugeStSApprovalTxns.push(
                generateTokenApprovalInput(gaugeInput.gaugeAddress, STS_ADDRESS, gaugeInput.stSAmountInWei.toString()),
            );

            // add deposit_reward_token transaction
            gaugeStSDepositTxns.push(
                generateRewardTokenDepositInput(
                    gaugeInput.gaugeAddress,
                    STS_ADDRESS,
                    gaugeInput.stSAmountInWei.toString(),
                ),
            );
        }
    }

    if (gaugeAddMissingRewardTokensTxns.length > 0) {
        const transactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Add reward tokens to gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeAddMissingRewardTokensTxns,
        };

        if (saveTransactionJson) {
            fs.writeFile(
                `./src/gaugeAutomation/gauge-transactions/add-reward-tokens-${batchId}.json`,
                JSON.stringify(transactionBatch, null, 2),
                function (err) {
                    if (err) {
                        throw err;
                    }
                },
            );
        }
        allTransactionBatches.push(transactionBatch);
    } else {
        console.log(`No add rewards token transactions found`);
    }

    if (gaugeBeetsApprovalTxns.length > 0) {
        const approvalTransactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Approving BEETS for gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeBeetsApprovalTxns,
        };

        const depositTransactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Deposit BEETS for gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeBeetsDepositTxns,
        };

        if (saveTransactionJson) {
            fs.writeFile(
                `./src/gaugeAutomation/gauge-transactions/approve-beets-${batchId}.json`,
                JSON.stringify(approvalTransactionBatch, null, 2),
                function (err) {
                    if (err) {
                        throw err;
                    }
                },
            );

            fs.writeFile(
                `./src/gaugeAutomation/gauge-transactions/deposit-beets-${batchId}.json`,
                JSON.stringify(depositTransactionBatch, null, 2),
                function (err) {
                    if (err) {
                        throw err;
                    }
                },
            );
        }

        allTransactionBatches.push(approvalTransactionBatch);
        allTransactionBatches.push(depositTransactionBatch);
    } else {
        console.log(`No gauge deposit beets transactions found`);
    }

    if (gaugeStSApprovalTxns.length > 0) {
        const approvalTransactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Approving stS for gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeStSApprovalTxns,
        };

        const depositTransactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Deposit stS for gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeStSDepositTxns,
        };

        if (saveTransactionJson) {
            fs.writeFile(
                `./src/gaugeAutomation/gauge-transactions/approve-sts-${batchId}.json`,
                JSON.stringify(approvalTransactionBatch, null, 2),
                function (err) {
                    if (err) {
                        throw err;
                    }
                },
            );

            fs.writeFile(
                `./src/gaugeAutomation/gauge-transactions/deposit-sts-${batchId}.json`,
                JSON.stringify(depositTransactionBatch, null, 2),
                function (err) {
                    if (err) {
                        throw err;
                    }
                },
            );
        }

        allTransactionBatches.push(approvalTransactionBatch);
        allTransactionBatches.push(depositTransactionBatch);
    } else {
        console.log(`No gauge deposit sts transactions found`);
    }

    return allTransactionBatches;
}

export function createTxnForTreveeBounty(
    amountUsd: string,
    minRewardPerVoteUsd: string,
    maxRewardPerVoteUsd: string,
    amountEth: string,
    minRewardPerVoteEth: string,
    maxRewardPerVoteEth: string,
) {
    const bountyTxns: Transaction[] = [];

    if (parseFloat(amountUsd) > 0) {
        const bountyAmountUsdInWei = parseUnits(amountUsd, 6);
        const minRewardPerVoteUsdInWei = parseUnits(minRewardPerVoteUsd, 6);
        const maxRewardPerVoteUsdInWei = parseUnits(maxRewardPerVoteUsd, 6);
        const feeAmountUsdInWei = (bountyAmountUsdInWei * 4n) / 100n; // 4% fee
        const totalAmountUsdInWei = bountyAmountUsdInWei + feeAmountUsdInWei;

        // add the approvals
        bountyTxns.push({
            to: SCUSD,
            value: '0',
            data: null,
            contractMethod: {
                inputs: [
                    {
                        internalType: 'address',
                        name: 'spender',
                        type: 'address',
                    },
                    {
                        internalType: 'uint256',
                        name: 'amount',
                        type: 'uint256',
                    },
                ],
                name: 'approve',
                payable: false,
            },
            contractInputsValues: {
                spender: VEUSD_MARKET,
                amount: totalAmountUsdInWei.toString(),
            },
        });

        bountyTxns.push({
            to: VEUSD_MARKET,
            value: '0',
            data: null,
            contractMethod: {
                inputs: [
                    { internalType: 'address', name: 'gauge', type: 'address' },
                    {
                        internalType: 'address',
                        name: 'rewardToken',
                        type: 'address',
                    },
                    { internalType: 'bool', name: 'startNextPeriod', type: 'bool' },
                    { internalType: 'uint48', name: 'duration', type: 'uint48' },
                    {
                        internalType: 'uint256',
                        name: 'minRewardPerVote',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'maxRewardPerVote',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'totalRewardAmount',
                        type: 'uint256',
                    },
                    { internalType: 'uint256', name: 'feeAmount', type: 'uint256' },
                    {
                        internalType: 'enum QuestDataTypes.QuestVoteType',
                        name: 'voteType',
                        type: 'uint8',
                    },
                    {
                        internalType: 'enum QuestDataTypes.QuestCloseType',
                        name: 'closeType',
                        type: 'uint8',
                    },
                    {
                        internalType: 'uint256[]',
                        name: 'voterList',
                        type: 'uint256[]',
                    },
                ],
                name: 'createRangedQuest',
                payable: false,
            },
            contractInputsValues: {
                gauge: '0xc5E0250037195850E4D987CA25d6ABa68ef5fEe8',
                rewardToken: SCUSD,
                startNextPeriod: 'false',
                duration: '1',
                minRewardPerVote: minRewardPerVoteUsdInWei.toString(),
                maxRewardPerVote: maxRewardPerVoteUsdInWei.toString(),
                totalRewardAmount: bountyAmountUsdInWei.toString(),
                feeAmount: feeAmountUsdInWei.toString(),
                voteType: '0',
                closeType: '0',
                voterList: '[]',
            },
        });
    }

    if (parseFloat(amountEth) > 0) {
        const bountyAmountEthInWei = parseEther(amountEth);
        const minRewardPerVoteEthInWei = parseEther(minRewardPerVoteEth);
        const maxRewardPerVoteEthInWei = parseEther(maxRewardPerVoteEth);
        const feeAmountEthInWei = (bountyAmountEthInWei * 4n) / 100n; // 4% fee
        const totalAmountEthInWei = bountyAmountEthInWei + feeAmountEthInWei;

        bountyTxns.push({
            to: SCETH,
            value: '0',
            data: null,
            contractMethod: {
                inputs: [
                    {
                        internalType: 'address',
                        name: 'spender',
                        type: 'address',
                    },
                    {
                        internalType: 'uint256',
                        name: 'amount',
                        type: 'uint256',
                    },
                ],
                name: 'approve',
                payable: false,
            },
            contractInputsValues: {
                spender: VEETH_MARKET,
                amount: totalAmountEthInWei.toString(),
            },
        });

        // add the deposit bounty transactions

        bountyTxns.push({
            to: VEETH_MARKET,
            value: '0',
            data: null,
            contractMethod: {
                inputs: [
                    { internalType: 'address', name: 'gauge', type: 'address' },
                    {
                        internalType: 'address',
                        name: 'rewardToken',
                        type: 'address',
                    },
                    { internalType: 'bool', name: 'startNextPeriod', type: 'bool' },
                    { internalType: 'uint48', name: 'duration', type: 'uint48' },
                    {
                        internalType: 'uint256',
                        name: 'minRewardPerVote',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'maxRewardPerVote',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'totalRewardAmount',
                        type: 'uint256',
                    },
                    { internalType: 'uint256', name: 'feeAmount', type: 'uint256' },
                    {
                        internalType: 'enum QuestDataTypes.QuestVoteType',
                        name: 'voteType',
                        type: 'uint8',
                    },
                    {
                        internalType: 'enum QuestDataTypes.QuestCloseType',
                        name: 'closeType',
                        type: 'uint8',
                    },
                    {
                        internalType: 'uint256[]',
                        name: 'voterList',
                        type: 'uint256[]',
                    },
                ],
                name: 'createRangedQuest',
                payable: false,
            },
            contractInputsValues: {
                gauge: '0xc5E0250037195850E4D987CA25d6ABa68ef5fEe8',
                rewardToken: SCETH,
                startNextPeriod: 'false',
                duration: '1',
                minRewardPerVote: minRewardPerVoteEthInWei.toString(),
                maxRewardPerVote: maxRewardPerVoteEthInWei.toString(),
                totalRewardAmount: bountyAmountEthInWei.toString(),
                feeAmount: feeAmountEthInWei.toString(),
                voteType: '0',
                closeType: '0',
                voterList: '[]',
            },
        });
    }

    if (bountyTxns.length > 0) {
        const transactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Add bounty for Trevee',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: bountyTxns,
        };

        fs.writeFile(
            `./src/treveeBounty/bounty-transactions/add-bounty-${moment().unix()}.json`,
            JSON.stringify(transactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
    }
}

function generateRewardTokenDepositInput(
    gaugeAddress: string,
    rewardTokenAddress: string,
    rewardTokenAmountInWei: string,
): Transaction {
    return {
        to: gaugeAddress,
        value: '0',
        data: null,
        contractMethod: {
            inputs: [
                {
                    name: '_reward_token',
                    type: 'address',
                },
                {
                    name: '_amount',
                    type: 'uint256',
                },
            ],
            name: 'deposit_reward_token',
            payable: false,
        },
        contractInputsValues: {
            _reward_token: rewardTokenAddress,
            _amount: rewardTokenAmountInWei,
        },
    };
}

function generateTokenApprovalInput(spender: string, tokenAddress: string, tokenAmountInWei: string): Transaction {
    return {
        to: tokenAddress,
        value: '0',
        data: null,
        contractMethod: {
            inputs: [
                {
                    internalType: 'address',
                    name: 'spender',
                    type: 'address',
                },
                {
                    internalType: 'uint256',
                    name: 'amount',
                    type: 'uint256',
                },
            ],
            name: 'approve',
            payable: false,
        },
        contractInputsValues: {
            spender: spender,
            amount: tokenAmountInWei,
        },
    };
}

function generateAddRewardTokenInput(gaugeAddress: string, rewardTokenAddress: string): Transaction {
    return {
        to: gaugeAddress,
        value: '0',
        data: null,
        contractMethod: {
            inputs: [
                {
                    name: '_reward_token',
                    type: 'address',
                },
                {
                    name: '_distributor',
                    type: 'address',
                },
            ],
            name: 'add_reward',
            payable: false,
        },
        contractInputsValues: {
            _reward_token: rewardTokenAddress,
            _distributor: LM_GAUGE_MSIG,
        },
    };
}

export async function proposeTransaction(
    safeAddress: string,
    transactionBatch: SafeTransactionBatch,
    nonce?: number,
): Promise<number> {
    const protocolKit = await Safe.init({
        provider: process.env.RPC_URL || 'https://rpc.soniclabs.com',
        signer: process.env.SAFE_PROPOSER_WALLET,
        safeAddress,
    });

    const apiKit = new SafeApiKit({
        chainId: 146n,
        apiKey: process.env.SAFE_API_KEY,
    });

    const nextNonce = await apiKit.getNextNonce(safeAddress);

    // we need to keep track of the nonce because the safe API is too slow for multiple transactions sent fast after each other
    const options = nonce !== undefined ? { nonce: nonce } : { nonce: parseFloat(nextNonce) };

    let safeTransaction: SafeTransaction = await protocolKit.createTransaction({
        transactions: transactionBatch.transactions,
        options,
    });

    // if there is only one transaction in the batch, we need to force it
    if (transactionBatch.transactions.length === 1) {
        const batch = await protocolKit.createTransactionBatch(transactionBatch.transactions, options);
        safeTransaction = await protocolKit.createTransaction({
            transactions: [batch],
            options,
        });
    }

    const latestNonce = safeTransaction.data.nonce;

    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signHash(safeTxHash);
    const senderAddress = await protocolKit.getSafeProvider().getSignerAddress();

    await apiKit.proposeTransaction({
        safeAddress: safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: senderAddress || '',
        senderSignature: signature.data,
    });

    return latestNonce;
}
