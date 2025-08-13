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
  diff: string;
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

function getDiff(lastBlock: Block, prev_timestamp?: number): bigint {
  const SCALE = 1_000_000n;
  const MAX_CHANGE_UP = 2n;
  const MAX_CHANGE_DOWN = 2n;
  const MIN_ST = Math.floor(BLOCK_TIME / 4);
  const MAX_ST = BLOCK_TIME * 4;

  // Use the stored diff from the last block
  const target = BigInt(("0x" + lastBlock.diff) || STARTING_DIFF);

  // solve time since last block
  let dt =
    lastBlock.timestamp - (prev_timestamp ?? lastBlock.timestamp - BLOCK_TIME);
  if (!Number.isFinite(dt) || dt <= 0) dt = 1;
  if (dt < MIN_ST) dt = MIN_ST;
  else if (dt > MAX_ST) dt = MAX_ST;

  const st = BigInt(dt);

  // calculate ratio
  let ratio = (st * SCALE) / BigInt(BLOCK_TIME);
  if (ratio < SCALE / MAX_CHANGE_DOWN) ratio = SCALE / MAX_CHANGE_DOWN;
  if (ratio > SCALE * MAX_CHANGE_UP) ratio = SCALE * MAX_CHANGE_UP;

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
