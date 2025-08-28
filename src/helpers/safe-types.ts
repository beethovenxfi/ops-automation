export interface SafeTransactionBatch {
    version: string;
    chainId: string;
    createdAt: number;
    meta: {
        name: string;
        description: string;
        txBuilderVersion: string;
        createdFromSafeAddress: string;
        createdFromOwnerAddress: string;
        checksum: string;
    };
    transactions: JsonTransaction[];
}

export interface JsonTransaction {
    to: string;
    value: string;
    data: string | null;
    contractMethod?: {
        inputs: Array<{
            name: string;
            type: string;
            internalType?: string;
        }>;
        name: string;
        payable: boolean;
    };
    contractInputsValues?: Record<string, any>;
}
