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
    marketAddress: string,
    bountyTokenAddress: string,
    amount: string,
    minRewardPerVote: string,
    maxRewardPerVote: string,
) {
    const decimals = bountyTokenAddress === SCETH ? 18 : 6;
    const feeAmount = (parseFloat(amount) * 0.04).toFixed(decimals);
    const feeAmountInWei = parseUnits(feeAmount, decimals).toString();
    const bountyAmountInWei = parseUnits(amount, decimals).toString();
    const amountInWei = parseUnits(amount, decimals).toString();
    const totalAmountInWei = (BigInt(amountInWei) + BigInt(feeAmountInWei)).toString();
    const minRewardPerVoteInWei = parseUnits(minRewardPerVote, decimals).toString();
    const maxRewardPerVoteInWei = parseUnits(maxRewardPerVote, decimals).toString();

    const bountyTxns: Transaction[] = [];

    // add the approval
    bountyTxns.push({
        to: bountyTokenAddress,
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
            spender: marketAddress,
            amount: totalAmountInWei,
        },
    });

    // add the deposit bounty transaction
    bountyTxns.push({
        to: marketAddress,
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
            rewardToken: bountyTokenAddress,
            startNextPeriod: 'false',
            duration: '1',
            minRewardPerVote: minRewardPerVoteInWei,
            maxRewardPerVote: maxRewardPerVoteInWei,
            totalRewardAmount: bountyAmountInWei,
            feeAmount: feeAmountInWei,
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
        `./src/treveeBounty/bounty-transactions/add-bounty-${bountyTokenAddress}-${moment().unix()}.json`,
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
