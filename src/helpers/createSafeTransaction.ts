import fs from 'fs';
import moment from 'moment';
import { parseEther } from 'viem';
import { BEETS_ADDRESS, FRAGMENTS_ADDRESS, LM_GAUGE_MSIG, STS_ADDRESS } from './constants';

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

export async function createTxnBatchForBeetsRewards(
    voteId: number,
    addRewardInput: AddRewardTxnInput[],
): Promise<void> {
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
                generateRewardTokenApprovalInput(
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
                generateRewardTokenApprovalInput(
                    gaugeInput.gaugeAddress,
                    STS_ADDRESS,
                    gaugeInput.stSAmountInWei.toString(),
                ),
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
                generateRewardTokenApprovalInput(
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
            `./src/gaugeAutomation/gauge-transactions/add-reward-tokens-${voteId}.json`,
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
            `./src/gaugeAutomation/gauge-transactions/approve-beets-${voteId}.json`,
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
            `./src/gaugeAutomation/gauge-transactions/deposit-beets-${voteId}.json`,
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
            `./src/gaugeAutomation/gauge-transactions/approve-sts-${voteId}.json`,
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
            `./src/gaugeAutomation/gauge-transactions/deposit-sts-${voteId}.json`,
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
            `./src/gaugeAutomation/gauge-transactions/approve-fragments-${voteId}.json`,
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
            `./src/gaugeAutomation/gauge-transactions/deposit-fragments-${voteId}.json`,
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

function generateRewardTokenApprovalInput(
    gaugeAddress: string,
    rewardTokenAddress: string,
    rewardTokenAmountInWei: string,
): Transaction {
    return {
        to: rewardTokenAddress,
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
            spender: gaugeAddress,
            amount: rewardTokenAmountInWei,
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
