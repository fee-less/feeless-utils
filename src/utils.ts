import pkg from "elliptic";
const { ec: EC } = pkg;
const ec = new EC("secp256k1");
import FeelessClient from "./client.js";

type TokenMint = {
  miningReward?: number;
  airdrop: number;
  token: string;
}

type Transaction = {
  sender: string;
  receiver: string;
  amount: number;
  signature: string;
  nonce: number;
  timestamp: number;
  token?: string;
  mint?: TokenMint;
  unlock?: number;
}

type Block = {
  timestamp: number;
  transactions: Transaction[];
  prev_hash: string;
  nonce: number;
  signature: string;
  proposer: string;
  hash: string;
}

type MintedTokenEntry = { miningReward: number, airdrop: number };
type MintedTokens = Map<string, MintedTokenEntry>;

type EventPayload = {
  event: "tx" | "block";
  data: any;
};

const POINTS = 5;
const MAX_SUPPLY = FLSStoFPoints(100000000);
const STARTING_REWARD = FLSStoFPoints(100);
const BASE_MINT_FEE = FLSStoFPoints(1000); // Minimum minting fee in fPoints
const BLOCK_TIME = 30000;
const DEV_FEE = 0.09;
const DEV_WALLET = "03bea510ff0689107a3a7b3ff3968e0554672142bbf6fc6db75d01e7aa6620e4f8";
const STARTING_DIFF = BigInt("0x0FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");

function FLSStoFPoints(flss: number) {
  return Math.round(flss * Math.pow(10, POINTS));
}

function fPointsToFLSS(fPoints: number) {
  return Number((fPoints / Math.pow(10, POINTS)).toFixed(POINTS));
}

function calculateReward(blockHeight: number): number {
  const k = -STARTING_REWARD / MAX_SUPPLY;
  return Math.round(STARTING_REWARD * Math.pow(Math.E, k * blockHeight));
}

function getDiff(blocks: Block[]): bigint {
  const WINDOW_SIZE = 100;
  const targetTime = BLOCK_TIME * WINDOW_SIZE; // e.g. 30s * 100 = 3000s

  if (blocks.length < WINDOW_SIZE) {
    return STARTING_DIFF;
  }

  // Take last WINDOW_SIZE blocks
  const recentBlocks = blocks.slice(-WINDOW_SIZE);

  // Actual timespan between oldest and newest blocks in window
  const actualTime =
    recentBlocks[recentBlocks.length - 1].timestamp - recentBlocks[0].timestamp;

  // Protect against zero or negative time
  if (actualTime <= 0) return STARTING_DIFF;

  // Calculate adjustment factor = expected / actual
  // If actual > expected => blocks slower => difficulty down (easier)
  // If actual < expected => blocks faster => difficulty up (harder)
  let adjustment = targetTime / actualTime;

  // Clamp adjustment between 0.5x and 1.5x (adjust as needed for smoothness)
  adjustment = Math.min(Math.max(adjustment, 0.5), 1.5);

  // Adjust difficulty accordingly
  let newDiff = BigInt(Math.floor(Number(STARTING_DIFF) * adjustment));

  // Clamp difficulty to be within bounds
  if (newDiff > STARTING_DIFF) newDiff = STARTING_DIFF;
  if (newDiff < 1n) newDiff = 1n; // avoid zero or negative difficulty

  return newDiff;
}

function randomKeyPair() {
  const kp = ec.genKeyPair();
  return { pub: kp.getPublic().encode("hex", true), priv: kp.getPrivate().toString("hex") };
}

function getPublicKey(priv: string) {
  const kp = ec.keyFromPrivate(priv);
  return kp.getPublic().encode("hex", true);
}

// Calculate dynamic minting fee based on recent minting activity
function calculateMintFee(height: number, mints: number): number {
  if (mints === 0 || height === 0) return BASE_MINT_FEE;
  return Math.round(Math.max(1, BASE_MINT_FEE * (mints / height)));
}

async function hashArgon(msg: string) {
  if (typeof window !== "undefined") {
    // We're in browser: do NOT import argon2
    throw new Error("argon2 hashing only supported in Node.js");
  }
  const argon2 = await import("argon2");

  const salt = Buffer.from('feeless-argon2-salt');
  const hashBuffer = await argon2.hash(msg, {
    raw: true,
    salt,
    timeCost: 1,
    parallelism: 2,
    memoryCost: 2 ** 14
  });

  const hexString = hashBuffer.toString('hex');
  return BigInt("0x" + hexString);
}

export type { Transaction, Block, EventPayload, TokenMint, MintedTokens, MintedTokenEntry };
export { MAX_SUPPLY, STARTING_REWARD, BLOCK_TIME, POINTS, DEV_FEE, BASE_MINT_FEE, calculateMintFee, DEV_WALLET, STARTING_DIFF, FLSStoFPoints, fPointsToFLSS, calculateReward, getDiff, randomKeyPair, getPublicKey, hashArgon, FeelessClient };
