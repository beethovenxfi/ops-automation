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
import { min } from 'lodash';
import { parseUnits } from 'ethers';

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

export function createTxnBatchForBeetsRewards(addRewardInput: AddRewardTxnInput[]): void {
    const batchId = moment().unix(); // Using current timestamp as voteId, can be replaced with a specific vote ID if needed
    let gaugeAddMissingRewardTokensTxns: Transaction[] = [];
    let gaugeBeetsApprovalTxns: Transaction[] = [];
    let gaugeBeetsDepositTxns: Transaction[] = [];
    let gaugeStSApprovalTxns: Transaction[] = [];
    let gaugeStSDepositTxns: Transaction[] = [];
    let gaugeFragmentsApprovalTxns: Transaction[] = [];
    let gaugeFragmentsDepositTxns: Transaction[] = [];

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

        if (gaugeInput.fragmentsAmountInWei > 0n) {
            // add the approve transcation
            gaugeFragmentsApprovalTxns.push(
                generateTokenApprovalInput(
                    gaugeInput.gaugeAddress,
                    FRAGMENTS_ADDRESS,
                    gaugeInput.fragmentsAmountInWei.toString(),
                ),
            );

            // add deposit_reward_token transaction
            gaugeFragmentsDepositTxns.push(
                generateRewardTokenDepositInput(
                    gaugeInput.gaugeAddress,
                    FRAGMENTS_ADDRESS,
                    gaugeInput.fragmentsAmountInWei.toString(),
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

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/add-reward-tokens-${batchId}.json`,
            JSON.stringify(transactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
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

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/approve-beets-${batchId}.json`,
            JSON.stringify(approvalTransactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );

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

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/deposit-beets-${batchId}.json`,
            JSON.stringify(depositTransactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
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

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/approve-sts-${batchId}.json`,
            JSON.stringify(approvalTransactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );

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

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/deposit-sts-${batchId}.json`,
            JSON.stringify(depositTransactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
    } else {
        console.log(`No gauge deposit beets transactions found`);
    }

    if (gaugeFragmentsApprovalTxns.length > 0) {
        const approvalTransactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Approving fragments for gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeFragmentsApprovalTxns,
        };

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/approve-fragments-${batchId}.json`,
            JSON.stringify(approvalTransactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );

        const depositTransactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Deposit fragments for gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeFragmentsDepositTxns,
        };

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/deposit-fragments-${batchId}.json`,
            JSON.stringify(depositTransactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
    } else {
        console.log(`No gauge deposit beets transactions found`);
    }
}

export function createTxnForTreveeBounty(
    amountUsd: string,
    minRewardPerVoteUsd: string,
    maxRewardPerVoteUsd: string,
    amountEth: string,
    minRewardPerVoteEth: string,
    maxRewardPerVoteEth: string,
) {
    const amountUsdInWei = parseUnits(amountUsd, 6);
    const minRewardPerVoteUsdInWei = parseUnits(minRewardPerVoteUsd, 6);
    const maxRewardPerVoteUsdInWei = parseUnits(maxRewardPerVoteUsd, 6);
    const feeAmountUsd = (parseFloat(amountUsd) * 0.04).toFixed(6);
    const feeAmountUsdInWei = parseUnits(feeAmountUsd, 6);
    const totalAmountUsdInWei = amountUsdInWei + feeAmountUsdInWei;

    const amountEthInWei = parseEther(amountEth);
    const minRewardPerVoteEthInWei = parseEther(minRewardPerVoteEth);
    const maxRewardPerVoteEthInWei = parseEther(maxRewardPerVoteEth);
    const feeAmountEth = (parseFloat(amountEth) * 0.04).toFixed(18);
    const feeAmountEthInWei = parseEther(feeAmountEth);
    const totalAmountEthInWei = amountEthInWei + feeAmountEthInWei;

    const bountyTxns: Transaction[] = [];

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
            totalRewardAmount: totalAmountUsdInWei.toString(),
            feeAmount: feeAmountUsdInWei.toString(),
            voteType: '0',
            closeType: '0',
            voterList: '[]',
        },
    });

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
            totalRewardAmount: totalAmountEthInWei.toString(),
            feeAmount: feeAmountEthInWei.toString(),
            voteType: '0',
            closeType: '0',
            voterList: '[]',
        },
    });

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
