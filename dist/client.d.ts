import { Transaction, Block, TokenMint, MintedTokenEntry } from "./utils.js";
interface TransactionHistory {
    type: 'send' | 'receive' | 'mint';
    amount: number;
    token?: string;
    timestamp: number;
    status: 'confirmed' | 'pending';
    address: string;
    blockHeight?: number;
}
interface SearchBlockResult {
    block: Block;
    height: number;
}
interface SearchTransactionResult {
    tx: Transaction;
    blockHeight?: number;
}
interface SearchResults {
    results: SearchTransactionResult[];
}
export declare class FeelessClient {
    private ws;
    private keys;
    private priv;
    private pub;
    private http;
    private seenMsgs;
    ready: boolean;
    onblock: (block: Block) => void;
    onutx: (tx: Transaction) => void;
    constructor(node: string, nodeHttp: string, privateKey: string);
    init(): Promise<boolean>;
    closeClient(): void;
    getPublic(): string;
    getPrivate(): string;
    signMessage(msg: string): string;
    pollBalance(token?: string, includeMempool?: boolean): Promise<number>;
    getBlockHeight(): Promise<number>;
    getDiff(): Promise<bigint>;
    getBlock(height: number): Promise<Block>;
    getMempool(): Promise<Transaction[]>;
    getTokens(): Promise<string[]>;
    getTokenInfo(token: string): Promise<MintedTokenEntry>;
    getTokenInfoByI(i: number): Promise<MintedTokenEntry>;
    getTokenCount(): Promise<MintedTokenEntry>;
    getMintFee(): Promise<number>;
    placeTX(receiver: string, amountFPoints: number, token?: string): Promise<boolean>;
    submitBlock(block: Block): Promise<boolean>;
    mintToken(tokenMint: TokenMint): Promise<boolean>;
    getHistory(): Promise<TransactionHistory[]>;
    searchBlockByHash(hash: string): Promise<SearchBlockResult>;
    searchTransaction(query: string): Promise<SearchResults>;
    getAddressHistory(address: string): Promise<TransactionHistory[]>;
    private waitForMessage;
}
export default FeelessClient;
export type { SearchBlockResult, SearchTransactionResult, SearchResults, TransactionHistory };
