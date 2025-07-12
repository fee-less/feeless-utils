import FeelessClient from "./client.js";
type TokenMint = {
    miningReward?: number;
    airdrop: number;
    token: string;
};
type Transaction = {
    sender: string;
    receiver: string;
    amount: number;
    signature: string;
    nonce: number;
    timestamp: number;
    token?: string;
    mint?: TokenMint;
};
type Block = {
    timestamp: number;
    transactions: Transaction[];
    prev_hash: string;
    nonce: number;
    signature: string;
    proposer: string;
    hash: string;
};
type MintedTokenEntry = {
    miningReward: number;
    airdrop: number;
};
type MintedTokens = Map<string, MintedTokenEntry>;
type EventPayload = {
    event: "tx" | "block";
    data: any;
};
declare const MAX_SUPPLY = 100000000;
declare const STARTING_REWARD = 100;
declare const BLOCK_TIME = 30000;
declare const ADJUST_PERCENT = 0.1;
declare const POINTS = 5;
declare const DEV_FEE = 0.09;
declare const DEV_WALLET = "0217821bc151c94d80290bd4610e283aa4ba1fb411bb8d40d1072fd0ace5a6b9a3";
declare const STARTING_DIFF: bigint;
declare const BASE_MINT_FEE: number;
declare function FLSStoFPoints(flss: number): number;
declare function fPointsToFLSS(fPoints: number): number;
declare function calculateReward(blockHeight: number): number;
declare function getDiff(blocks: Block[]): bigint;
declare function randomKeyPair(): {
    pub: string;
    priv: string;
};
declare function getPublicKey(priv: string): string;
declare function calculateMintFee(height: number, mints: number): number;
declare function hashArgon(msg: string): Promise<bigint>;
export type { Transaction, Block, EventPayload, TokenMint, MintedTokens, MintedTokenEntry };
export { MAX_SUPPLY, STARTING_REWARD, BLOCK_TIME, ADJUST_PERCENT, POINTS, DEV_FEE, BASE_MINT_FEE, calculateMintFee, DEV_WALLET, STARTING_DIFF, FLSStoFPoints, fPointsToFLSS, calculateReward, getDiff, randomKeyPair, getPublicKey, hashArgon, FeelessClient };
