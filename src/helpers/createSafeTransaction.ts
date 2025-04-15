import fs from 'fs';
import moment from 'moment';
import { parseEther } from 'viem';
import { BEETS_ADDRESS, FRAGMENTS_ADDRESS, STS_ADDRESS } from './constants';

const LM_GAUGE_MSIG = '0x97079F7E04B535FE7cD3f972Ce558412dFb33946';

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

export interface AddBeetsRewardTxnInput {
    gaugeAddress: string;
    beetsAmountInWei: bigint;
    addBeetsRewardToken: boolean;
    addStSRewardToken: boolean;
    addFragmentsRewardToken: boolean;
}

export async function createTxnBatchForBeetsRewards(
    voteId: number,
    addRewardInput: AddBeetsRewardTxnInput[],
): Promise<void> {
    let gaugeDepositTxns: Transaction[] = [];
    let gaugeAddRewardTxns: Transaction[] = [];

    for (const gaugeInput of addRewardInput) {
        if (gaugeInput.addBeetsRewardToken) {
            gaugeAddRewardTxns.push({
                to: gaugeInput.gaugeAddress,
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
                    _reward_token: BEETS_ADDRESS,
                    _distributor: LM_GAUGE_MSIG,
                },
            });
        }

        if (gaugeInput.addStSRewardToken) {
            gaugeAddRewardTxns.push({
                to: gaugeInput.gaugeAddress,
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
                    _reward_token: STS_ADDRESS,
                    _distributor: LM_GAUGE_MSIG,
                },
            });
        }

        if (gaugeInput.addFragmentsRewardToken) {
            gaugeAddRewardTxns.push({
                to: gaugeInput.gaugeAddress,
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
                    _reward_token: FRAGMENTS_ADDRESS,
                    _distributor: LM_GAUGE_MSIG,
                },
            });
        }

        // add the approve transcation
        gaugeDepositTxns.push({
            to: BEETS_ADDRESS,
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
                spender: gaugeInput.gaugeAddress,
                amount: gaugeInput.beetsAmountInWei.toString(),
            },
        });

        // add deposit_reward_token transaction
        gaugeDepositTxns.push({
            to: gaugeInput.gaugeAddress,
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
                _reward_token: BEETS_ADDRESS,
                _amount: gaugeInput.beetsAmountInWei.toString(),
            },
        });
    }

    if (gaugeDepositTxns.length > 0) {
        const transactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Adding BEETS rewards from gauge results',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeDepositTxns,
        };

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/deposit-beets-${voteId}.json`,
            JSON.stringify(transactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
    } else {
        console.log(`No gauge deposit reward transactions found`);
    }

    if (gaugeAddRewardTxns.length > 0) {
        const transactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Add reward token to gauges',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: LM_GAUGE_MSIG,
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: gaugeAddRewardTxns,
        };

        fs.writeFile(
            `./src/gaugeAutomation/gauge-transactions/add-reward-token-${voteId}.json`,
            JSON.stringify(transactionBatch, null, 2),
            function (err) {
                if (err) {
                    throw err;
                }
            },
        );
    } else {
        console.log(`No add reward token transactions found`);
    }
}
