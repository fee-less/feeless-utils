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
  // If there aren't at least 2 blocks, we can't infer a solve time yet.
  if (!blocks || blocks.length < 2) return STARTING_DIFF;

  // --- Tunables (safe defaults) ---
  const WINDOW = 60; // How many recent solvetimes to consider
  const MAX_CHANGE_UP = 2n; // Max 2x easier per adjustment step
  const MAX_CHANGE_DOWN = 2n; // Max 2x harder per adjustment step
  const SCALE = 1_000_000n; // Fixed-point scale for ratios

  // Per-solvetime clamping to damp spikes (e.g., bad clocks, bursts)
  const MIN_ST = Math.floor(BLOCK_TIME / 4); // 0.25 * T
  const MAX_ST = BLOCK_TIME * 4; // 4 * T

  // Weighted average helper (LWMA): recent solvetimes get higher weights.
  function lwmaSolveTime(endExclusive: number): bigint {
    const start = Math.max(1, endExclusive - WINDOW);
    const m = endExclusive - start; // number of intervals available
    if (m <= 0) return BigInt(BLOCK_TIME);

    let wSum = 0n;
    let stWeighted = 0n;
    // weights: 1..m (newer => larger weight)
    for (let i = start; i < endExclusive; i++) {
      // Solve time between block i and i-1
      let dt = blocks[i].timestamp - blocks[i - 1].timestamp;
      if (!Number.isFinite(dt)) dt = BLOCK_TIME;
      if (dt <= 0) dt = 1; // monotonic guard
      // clamp spike/outlier impact
      if (dt < MIN_ST) dt = MIN_ST;
      else if (dt > MAX_ST) dt = MAX_ST;

      const w = BigInt(i - start + 1); // 1..m
      wSum += w;
      stWeighted += w * BigInt(dt);
    }

    if (wSum === 0n) return BigInt(BLOCK_TIME);
    return stWeighted / wSum; // bigint milliseconds
  }

  // Rate-limit ratio (fixed-point)
  function clampRatio(r: bigint): bigint {
    const minR = SCALE / MAX_CHANGE_DOWN; // e.g., 1/2 => 0.5
    const maxR = SCALE * MAX_CHANGE_UP; // e.g., 2/1 => 2.0
    if (r < minR) return minR;
    if (r > maxR) return maxR;
    return r;
  }

  // Deterministically walk the chain to the current target, then compute next.
  let target = STARTING_DIFF;

  // Step through historical blocks so difficulty depends only on chain history.
  // For each height i, compute the target that *would have* produced block i.
  for (let i = 1; i < blocks.length; i++) {
    const st = lwmaSolveTime(i); // uses up to WINDOW recent intervals ending at i-1 -> i
    // ratio = LWMA / TARGET
    let ratio = (st * SCALE) / BigInt(BLOCK_TIME);
    ratio = clampRatio(ratio);
    // Increase target (easier) if blocks were slow; decrease if they were fast.
    let nextTarget = (target * ratio) / SCALE;

    // Keep within sane bounds
    if (nextTarget < 1n) nextTarget = 1n;
    if (nextTarget > STARTING_DIFF) nextTarget = STARTING_DIFF;

    target = nextTarget;
  }

  const st = lwmaSolveTime(blocks.length);
  let ratio = (st * SCALE) / BigInt(BLOCK_TIME);
  ratio = clampRatio(ratio);
  let nextTarget = (target * ratio) / SCALE;

  if (nextTarget < 1n) nextTarget = 1n;
  if (nextTarget > STARTING_DIFF) nextTarget = STARTING_DIFF;

  return nextTarget;
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
