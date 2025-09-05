import pkg from "elliptic";
const { ec: EC } = pkg;
const ec = new EC("secp256k1");
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
  unlock?: number;
};

type Block = {
  timestamp: number;
  transactions: Transaction[] | string;
  prev_hash: string;
  nonce: number;
  signature: string;
  proposer: string;
  hash: string;
  diff: string;
};

type MintedTokenEntry = { miningReward: number; airdrop: number };
type MintedTokens = Map<string, MintedTokenEntry>;

type EventPayload = {
  event: "tx" | "block" | "push";
  data: any;
};

const POINTS = 5;
const MAX_SUPPLY = FLSStoFPoints(100000000);
const STARTING_REWARD = FLSStoFPoints(100);
const BASE_MINT_FEE = FLSStoFPoints(1000); // Minimum minting fee in fPoints
const BLOCK_TIME = 30000;
const DEV_FEE = 0.07;
const DEV_WALLET =
  "02b4a4887c88e80d32fd9fd6317bbaac2a28c4070feb6d93f82bbefc52f5b85f13";
const STARTING_DIFF =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;
const TAIL = 30;
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
  const N = TAIL;
  if (!blocks || blocks.length < 2) {
    return STARTING_DIFF;
  }

  // Take the last up to N blocks
  const tail = blocks.slice(-Math.min(N, blocks.length));

  // Calculate weighted average interval
  const intervals: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    const dt = Number(tail[i].timestamp) - Number(tail[i - 1].timestamp);
    intervals.push(dt > 0 ? dt : 1);
  }
  if (intervals.length === 0) return STARTING_DIFF;

  // Weighted average: newer intervals have higher weight
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < intervals.length; i++) {
    const weight = i + 1; // older blocks = smaller weight, newer = bigger
    weightedSum += intervals[i] * weight;
    weightTotal += weight;
  }
  const weightedAvg = weightedSum / weightTotal;

  const targetTime = BLOCK_TIME;
  let ratio = weightedAvg / targetTime;

  // Clamp ratio to avoid large spikes
  const MIN_FACTOR = 0.85;
  const MAX_FACTOR = 1.15;
  if (ratio < MIN_FACTOR) ratio = MIN_FACTOR;
  if (ratio > MAX_FACTOR) ratio = MAX_FACTOR;

  // Parse previous difficulty as bigint from hex (no 0x in string)
  let prevDiff;
  try {
    const raw = tail[tail.length - 1].diff;
    prevDiff = BigInt("0x" + raw);
  } catch (e) {
    prevDiff = STARTING_DIFF;
  }

  // Apply ratio using bigint-safe scaling
  const SCALE = 1_000_000n;
  const factorInt = BigInt(Math.floor(ratio * Number(SCALE)));
  let newDiff = (prevDiff * factorInt) / SCALE;

  // Clamp final difficulty
  if (newDiff < 1n) newDiff = 1n;
  if (newDiff > STARTING_DIFF) newDiff = STARTING_DIFF;

  return newDiff;
}

function randomKeyPair() {
  const kp = ec.genKeyPair();
  return {
    pub: kp.getPublic().encode("hex", true),
    priv: kp.getPrivate().toString("hex"),
  };
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

  const salt = Buffer.from("feeless-argon2-salt");
  const hashBuffer = await argon2.hash(msg, {
    raw: true,
    salt,
    timeCost: 1,
    parallelism: 2,
    memoryCost: 2 ** 14,
  });

  const hexString = hashBuffer.toString("hex");
  return BigInt("0x" + hexString);
}

export type {
  Transaction,
  Block,
  EventPayload,
  TokenMint,
  MintedTokens,
  MintedTokenEntry,
};
export {
  MAX_SUPPLY,
  STARTING_REWARD,
  BLOCK_TIME,
  POINTS,
  DEV_FEE,
  BASE_MINT_FEE,
  calculateMintFee,
  DEV_WALLET,
  STARTING_DIFF,
  TAIL,
  FLSStoFPoints,
  fPointsToFLSS,
  calculateReward,
  getDiff,
  randomKeyPair,
  getPublicKey,
  hashArgon,
  FeelessClient,
};
