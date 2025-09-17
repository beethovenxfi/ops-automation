import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import { Interface } from 'ethers';
import { JsonTransaction, SafeTransactionBatch } from './safe-types';

function encodeContractCall(transaction: JsonTransaction): string {
    // If data is already encoded, return it
    if (transaction.data && transaction.data !== '0x' && transaction.data !== null) {
        return transaction.data;
    }

    // If no contract method info, return empty data
    if (!transaction.contractMethod || !transaction.contractInputsValues) {
        return '0x';
    }

    try {
        // Build function signature
        const inputs = transaction.contractMethod.inputs
            .map((input) => `${input.type}${input.name ? ` ${input.name}` : ''}`)
            .join(', ');
        const functionSignature = `function ${transaction.contractMethod.name}(${inputs})`;

        // Create interface and encode
        const iface = new Interface([functionSignature]);

        // Extract parameter values in correct order
        const paramValues = transaction.contractMethod.inputs.map(
            (input) => transaction.contractInputsValues![input.name],
        );

        return iface.encodeFunctionData(transaction.contractMethod.name, paramValues);
    } catch (error) {
        console.error('Error encoding contract call:', error);
        console.error('Transaction:', JSON.stringify(transaction, null, 2));
        throw new Error(`Failed to encode contract call for ${transaction.contractMethod.name}: ${error}`);
    }
}

function convertToMetaTransactions(transactions: JsonTransaction[]): MetaTransactionData[] {
    return transactions.map((tx) => ({
        to: tx.to,
        value: tx.value || '0',
        data: encodeContractCall(tx),
        operation: OperationType.Call,
    }));
}

export async function proposeBatch(
    batch: SafeTransactionBatch,
    isSingleTransfer: boolean,
    nonce?: number,
): Promise<number> {
    const protocolKit = await Safe.init({
        provider: process.env.RPC_URL || 'https://rpc.soniclabs.com',
        signer: process.env.SAFE_PROPOSER_WALLET,
        safeAddress: batch.meta.createdFromSafeAddress,
    });

    if (!protocolKit) {
        throw new Error('Failed to initialize Protocol Kit');
    }

    const apiKit = new SafeApiKit({
        chainId: 146n,
        apiKey: process.env.SAFE_API_KEY,
    });

    if (!apiKit) {
        throw new Error('Failed to initialize API Kit');
    }

    const nextNonce = await apiKit.getNextNonce(batch.meta.createdFromSafeAddress);

    // we need to keep track of the nonce because the safe API is too slow for multiple transactions sent fast after each other
    const options = nonce !== undefined ? { nonce: nonce } : { nonce: parseFloat(nextNonce) };

    // Convert JSON transactions to Safe SDK format
    const metaTransactions = convertToMetaTransactions(batch.transactions);

    // Create Safe transaction
    let safeTransaction = await protocolKit.createTransaction({
        transactions: metaTransactions,
        options,
    });

    // if there is only one transfer transaction in the batch, we need to force it
    if (isSingleTransfer) {
        const batch = await protocolKit.createTransactionBatch(metaTransactions, options);
        safeTransaction = await protocolKit.createTransaction({
            transactions: [batch],
            options,
        });
    }

    // Get transaction hash and sign
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signHash(safeTxHash);
    const senderAddress = await protocolKit.getSafeProvider().getSignerAddress();

    // Propose transaction
    await apiKit.proposeTransaction({
        safeAddress: batch.meta.createdFromSafeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: senderAddress || '',
        senderSignature: signature.data,
        origin: batch.meta.description || 'Proposed via Safe SDK',
    });

    return safeTransaction.data.nonce;
}
