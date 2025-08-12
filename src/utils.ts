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

function getDiff(blocks: Block[]) {
  // If we don't have at least 2 blocks we can't compute intervals -> return starting diff.
  if (!Array.isArray(blocks) || blocks.length < 2) return STARTING_DIFF;

  // Number of intervals to average over (up to 100 most recent intervals)
  const WINDOW = 100;
  const n = Math.min(WINDOW, blocks.length - 1);

  // Sum the last n deltas between consecutive blocks
  let sum = 0;
  for (let i = blocks.length - n; i < blocks.length; i++) {
    const delta = blocks[i].timestamp - blocks[i - 1].timestamp;
    // ensure minimum sensible delta (avoid negatives)
    const safeDelta = Math.max(0, delta);
    sum += safeDelta;
  }

  const avgDelta = Math.round(sum / n); // average milliseconds per block in the window

  // ratio >1 => blocks are slower than target -> make easier (increase DIFF)
  // ratio <1 => blocks are faster than target -> make harder (decrease DIFF)
  const ratio = avgDelta / BLOCK_TIME;

  // Guard against extreme swings: clamp multiplier between MIN_MULT and MAX_MULT
  // (these represent 0.5x .. 1.5x by default)
  const MIN_MULT = 50; // 0.50
  const MAX_MULT = 150; // 1.50

  // multiplier as integer percent (e.g., 102 for 1.02)
  let multiplier = Math.round(ratio * 100);
  multiplier = Math.max(MIN_MULT, Math.min(multiplier, MAX_MULT));

  // Compute DIFF using BigInt arithmetic
  // DIFF = STARTING_DIFF * multiplier / 100
  let DIFF = (STARTING_DIFF * BigInt(multiplier)) / 100n;

  // Sanity clamps: ensure DIFF stays within [0, STARTING_DIFF]
  if (DIFF > STARTING_DIFF) DIFF = STARTING_DIFF;
  if (DIFF < 0n) DIFF = 0n;

  return DIFF;
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
