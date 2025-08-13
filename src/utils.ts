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
  transactions: Transaction[];
  prev_hash: string;
  nonce: number;
  signature: string;
  proposer: string;
  hash: string;
};

type MintedTokenEntry = { miningReward: number; airdrop: number };
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
const DEV_WALLET =
  "03bea510ff0689107a3a7b3ff3968e0554672142bbf6fc6db75d01e7aa6620e4f8";
const STARTING_DIFF =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;
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
  if (!blocks || blocks.length < 2) return STARTING_DIFF;

  const TARGET_TIME = BLOCK_TIME; // 30s target (in ms)
  const LOOKBACK_BLOCKS = 10; // median over last 10 blocks
  const SMOOTHING_NUM = 1n; // EMA smoothing numerator
  const SMOOTHING_DEN = 5n; // EMA smoothing denominator (1/5 = 20% change per step)

  const MIN_DIFFICULTY = 1n;
  const MAX_DIFFICULTY = undefined; // or set a cap

  let currentTarget = STARTING_DIFF;

  for (let i = 1; i < blocks.length; i++) {
    if (i >= LOOKBACK_BLOCKS) {
      let times = [];

      for (let j = i - LOOKBACK_BLOCKS + 1; j <= i; j++) {
        let dt = blocks[j].timestamp - blocks[j - 1].timestamp;

        // clamp to avoid extreme skew
        if (dt < TARGET_TIME * 0.5) dt = TARGET_TIME * 0.5;
        if (dt > TARGET_TIME * 2.0) dt = TARGET_TIME * 2.0;

        times.push(dt);
      }

      // sort to get median
      times.sort((a, b) => a - b);
      const medianDt = times[Math.floor(times.length / 2)];

      // ratio = actual / target
      const num = BigInt(medianDt);
      const den = BigInt(TARGET_TIME);

      // adjust difficulty toward desired ratio
      let rawTarget = (currentTarget * den) / num;

      // optional global limits
      if (rawTarget < MIN_DIFFICULTY) rawTarget = MIN_DIFFICULTY;
      if (MAX_DIFFICULTY && rawTarget > MAX_DIFFICULTY)
        rawTarget = MAX_DIFFICULTY;

      // EMA smoothing
      currentTarget =
        (currentTarget * (SMOOTHING_DEN - SMOOTHING_NUM) +
          rawTarget * SMOOTHING_NUM) /
        SMOOTHING_DEN;
    }
  }

  return currentTarget;
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
  FLSStoFPoints,
  fPointsToFLSS,
  calculateReward,
  getDiff,
  randomKeyPair,
  getPublicKey,
  hashArgon,
  FeelessClient,
};
