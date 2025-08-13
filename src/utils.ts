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
  const RETARGET_INTERVAL = 3;
  const LOOKBACK_BLOCKS = 30;

  // ±40% in fractional form 7/5 ≈ 1.4 (no floats)
  const MAX_CHANGE_NUM = 7n;
  const MAX_CHANGE_DEN = 5n;

  // (optional) global difficulty limits
  const MIN_DIFFICULTY: bigint | undefined = 1n;
  const MAX_DIFFICULTY: bigint | undefined = undefined;

  if (!blocks || blocks.length === 0) return STARTING_DIFF;

  let currentTarget: bigint = STARTING_DIFF;

  for (let i = 0; i < blocks.length; i++) {
    // Retarget every RETARGET_INTERVAL, when we already have a full lookback
    if ((i + 1) % RETARGET_INTERVAL === 0 && i >= LOOKBACK_BLOCKS) {
      let totalDelta = 0;
      let valid = true;

      // Hardening: clamp individual dt values to limit the influence of outliers/time-warp.
      // Note: BLOCK_TIME and timestamps must be in the same units (here: ms).
      const minDt = Math.max(1, Math.floor(BLOCK_TIME / 4));
      const maxDt = Math.max(minDt + 1, BLOCK_TIME * 4);

      for (let j = i - LOOKBACK_BLOCKS + 1; j <= i; j++) {
        let dt = blocks[j].timestamp - blocks[j - 1].timestamp;

        if (!Number.isFinite(dt) || dt <= 0) {
          valid = false;
          break;
        }

        // per-block clamp
        if (dt < minDt) dt = minDt;
        if (dt > maxDt) dt = maxDt;

        totalDelta += dt;
      }
      if (!valid) continue;

      // ratio = (totalDelta / LOOKBACK_BLOCKS) / BLOCK_TIME
      //       = totalDelta / (LOOKBACK_BLOCKS * BLOCK_TIME)
      const num = BigInt(totalDelta);
      const den = BigInt(LOOKBACK_BLOCKS * BLOCK_TIME);

      // Clamp num/den to [1/MAX_CHANGE, MAX_CHANGE] without floats:
      // tooHigh: num/den > MAX_CHANGE_NUM/MAX_CHANGE_DEN  <=>  num * MAX_CHANGE_DEN > den * MAX_CHANGE_NUM
      const tooHigh = num * MAX_CHANGE_DEN > den * MAX_CHANGE_NUM;
      const tooLow = num * MAX_CHANGE_NUM < den * MAX_CHANGE_DEN; // num/den < 1/MAX_CHANGE

      let adjNum = num;
      let adjDen = den;

      if (tooHigh) {
        // set exactly to MAX_CHANGE = 7/5
        adjNum = den * MAX_CHANGE_NUM;
        adjDen = MAX_CHANGE_DEN * den;
      } else if (tooLow) {
        // set exactly to 1/MAX_CHANGE = 5/7
        adjNum = den * MAX_CHANGE_DEN;
        adjDen = MAX_CHANGE_NUM * den;
      }

      // Apply correction: round to nearest to reduce bias
      const numerator = currentTarget * adjNum + adjDen / 2n;
      let newTarget = numerator / adjDen;

      // Global limits (optional)
      if (MIN_DIFFICULTY !== undefined && newTarget < MIN_DIFFICULTY)
        newTarget = MIN_DIFFICULTY;
      if (MAX_DIFFICULTY !== undefined && newTarget > MAX_DIFFICULTY)
        newTarget = MAX_DIFFICULTY;

      currentTarget = newTarget;
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
