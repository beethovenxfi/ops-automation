import * as core from '@actions/core';
import * as fs from 'fs';
import { getV3PoolIds } from '../helpers/utils';

import moment from 'moment';
import { PROTOCOL_FEE_CONTROLLER, REVENUE_MSIG } from '../helpers/constants';
import _ from 'lodash';

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
    pool: string;
    recipient: string;
}

export interface AddBeetsRewardTxnInput {
    gaugeAddress: string;
    beetsAmountInWei: bigint;
    addRewardToken: boolean;
}

const excludedPools = ['0x3bf110657118b51a1f2c1f1d7d593577b6033fa9'];

async function run(): Promise<void> {
    const poolIds = await getV3PoolIds();
    const recipient = process.env.RECIPIENT || REVENUE_MSIG;

    try {
        // build list of txns
        createTxnBatchForWithdrawal(poolIds, recipient);
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

export function createTxnBatchForWithdrawal(poolAddresses: string[], recipient: string) {
    let withdrawTxns: Transaction[] = [];

    for (const address of poolAddresses) {
        if (excludedPools.includes(address.toLowerCase())) {
            continue;
        }
        withdrawTxns.push({
            to: PROTOCOL_FEE_CONTROLLER,
            value: '0',
            data: null,

            contractMethod: {
                inputs: [
                    { internalType: 'address', name: 'pool', type: 'address' },
                    { internalType: 'address', name: 'recipient', type: 'address' },
                ],
                name: 'withdrawProtocolFees',
                payable: false,
            },
            contractInputsValues: {
                pool: address,
                recipient: recipient,
            },
        });
    }

    const batches = _.chunk(withdrawTxns, 10);

    let i = 0;
    for (const batch of batches) {
        if (batch.length > 0) {
            const transactionBatch: SafeTransactionBatch = {
                version: '1.0',
                chainId: '146',
                createdAt: moment().unix(),
                meta: {
                    name: 'Transactions Batch',
                    description: `Withdrawing fees from the fee controller to ${recipient}`,
                    txBuilderVersion: '1.18.0',
                    createdFromSafeAddress: '0x26377CAB961c84F2d7b9d9e36D296a1C1c77C995',
                    createdFromOwnerAddress: '',
                    checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
                },
                transactions: batch,
            };

            fs.writeFile(
                `./src/feeAutomation/txns/withdrawFees-${moment().unix()}-${i}.json`,
                JSON.stringify(transactionBatch, null, 2),
                function (err) {
                    if (err) {
                        throw err;
                    }
                },
            );
        } else {
            console.log(`No withdraw txns found`);
        }
    }
}

run();
