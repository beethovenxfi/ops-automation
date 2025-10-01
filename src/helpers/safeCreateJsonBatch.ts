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
import { JsonTransaction, SafeTransactionBatch } from './safe-types';
import _ from 'lodash';

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

export function createTxBatchForBeetsTransfer(from: string, to: string, amount: string): SafeTransactionBatch[] {
    const tx: JsonTransaction = {
        to: BEETS_ADDRESS,
        value: '0',
        data: null,
        contractMethod: {
            inputs: [
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
            ],
            name: 'transfer',
            payable: false,
        },
        contractInputsValues: {
            to: to,
            value: amount,
        },
    };

    const transactionBatch: SafeTransactionBatch = {
        version: '1.0',
        chainId: '146',
        createdAt: moment().unix(),
        meta: {
            name: 'Transactions Batch',
            description: 'Send Beets',
            txBuilderVersion: '1.18.0',
            createdFromSafeAddress: from,
            createdFromOwnerAddress: '',
            checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
        },
        transactions: [tx],
    };

    return [transactionBatch];
}

export async function createTxnBatchForHiddenHandBribes(voteId: number, depositBribeInput: DepositBribeTxnInput[]) {
    const gaugeBribeDepositTxns: JsonTransaction[] = [];
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

    const allTransactions: JsonTransaction[] = [];

    for (const gaugeInput of addRewardInput) {
        if (gaugeInput.addBeetsRewardToken) {
            allTransactions.push(generateAddRewardTokenInput(gaugeInput.gaugeAddress, BEETS_ADDRESS));
        }

        if (gaugeInput.addStSRewardToken) {
            allTransactions.push(generateAddRewardTokenInput(gaugeInput.gaugeAddress, STS_ADDRESS));
        }

        if (gaugeInput.addFragmentsRewardToken) {
            allTransactions.push(generateAddRewardTokenInput(gaugeInput.gaugeAddress, FRAGMENTS_ADDRESS));
        }

        if (gaugeInput.beetsAmountInWei > 0n) {
            // add the approve transcation
            allTransactions.push(
                generateTokenApprovalInput(
                    gaugeInput.gaugeAddress,
                    BEETS_ADDRESS,
                    gaugeInput.beetsAmountInWei.toString(),
                ),
            );

            // add deposit_reward_token transaction
            allTransactions.push(
                generateRewardTokenDepositInput(
                    gaugeInput.gaugeAddress,
                    BEETS_ADDRESS,
                    gaugeInput.beetsAmountInWei.toString(),
                ),
            );
        }

        if (gaugeInput.stSAmountInWei > 0n) {
            // add the approve transcation
            allTransactions.push(
                generateTokenApprovalInput(gaugeInput.gaugeAddress, STS_ADDRESS, gaugeInput.stSAmountInWei.toString()),
            );

            // add deposit_reward_token transaction
            allTransactions.push(
                generateRewardTokenDepositInput(
                    gaugeInput.gaugeAddress,
                    STS_ADDRESS,
                    gaugeInput.stSAmountInWei.toString(),
                ),
            );
        }
    }

    if (allTransactions.length > 0) {
        const batches = _.chunk(allTransactions, 50); // Split into batches of 50 transactions each

        // if the last batch has only one transaction, move it to the previous batch
        if (batches.length > 1 && batches[batches.length - 1].length === 1) {
            const lastElement = batches.pop()![0];
            batches[batches.length - 1].push(lastElement);
        }

        let counter = 0;
        for (const txns of batches) {
            const transactionBatch: SafeTransactionBatch = {
                version: '1.0',
                chainId: '146',
                createdAt: moment().unix(),
                meta: {
                    name: 'Transactions Batch',
                    description: 'Weekly gauge rewards',
                    txBuilderVersion: '1.18.0',
                    createdFromSafeAddress: LM_GAUGE_MSIG,
                    createdFromOwnerAddress: '',
                    checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
                },
                transactions: txns,
            };

            if (saveTransactionJson) {
                fs.writeFile(
                    `./src/gaugeAutomation/gauge-transactions/weekly-rewards-${counter}-${batchId}.json`,
                    JSON.stringify(transactionBatch, null, 2),
                    function (err) {
                        if (err) {
                            throw err;
                        }
                    },
                );
            }
            allTransactionBatches.push(transactionBatch);
            counter++;
        }
    } else {
        console.log(`No add rewards token transactions found`);
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
    const bountyTxns: JsonTransaction[] = [];

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
): JsonTransaction {
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

function generateTokenApprovalInput(spender: string, tokenAddress: string, tokenAmountInWei: string): JsonTransaction {
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

function generateAddRewardTokenInput(gaugeAddress: string, rewardTokenAddress: string): JsonTransaction {
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
