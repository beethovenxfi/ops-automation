import * as core from '@actions/core';
import * as fs from 'fs';
import { getV3PoolIds } from '../helpers/utils';

import moment from 'moment';

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

async function run(): Promise<void> {
    // get gauge addresses
    const poolIds = await getV3PoolIds();

    try {
        // build list of txns
        createTxnBatchForCollection(poolIds);
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

export function createTxnBatchForCollection(poolAddresses: string[]) {
    let withdrawTxns: Transaction[] = [];

    for (const address of poolAddresses) {
        // add the approve transcation
        withdrawTxns.push({
            to: '0xa731C23D7c95436Baaae9D52782f966E1ed07cc8',
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
                recipient: '0x26377CAB961c84F2d7b9d9e36D296a1C1c77C995',
            },
        });
    }

    if (withdrawTxns.length > 0) {
        const transactionBatch: SafeTransactionBatch = {
            version: '1.0',
            chainId: '146',
            createdAt: moment().unix(),
            meta: {
                name: 'Transactions Batch',
                description: 'Withdrawing fees from the fee controller to the revenue msig',
                txBuilderVersion: '1.18.0',
                createdFromSafeAddress: '0x26377CAB961c84F2d7b9d9e36D296a1C1c77C995',
                createdFromOwnerAddress: '',
                checksum: '0xfea43c482aab4a5993323fc70e869023974239c62641724d46c28ab9c98202c3',
            },
            transactions: withdrawTxns,
        };

        fs.writeFile(
            `./feeAutomation/txns/withdrawFees-${moment().unix()}.json`,
            JSON.stringify(transactionBatch),
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

run();
