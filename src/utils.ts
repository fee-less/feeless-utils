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
  const RETARGET_INTERVAL = 10;
  const MAX_ADJUST = 4n;
  const targetTimespan = BigInt(RETARGET_INTERVAL) * BigInt(BLOCK_TIME); // ms

  let difficulties = [];
  let currentTarget = STARTING_DIFF;

  function medianTimePastAt(idx: number) {
    if (idx <= 1) return BigInt(blocks[idx].timestamp);
    const a = BigInt(blocks[idx].timestamp);
    const b = BigInt(blocks[idx - 1].timestamp);
    const c = BigInt(blocks[idx - 2].timestamp);
    if ((a >= b && a <= c) || (a <= b && a >= c)) return a;
    if ((b >= a && b <= c) || (b <= a && b >= c)) return b;
    return c;
  }

  for (let i = 0; i < blocks.length; i++) {
    // Store difficulty for this block
    difficulties.push(currentTarget);

    // Check if we should retarget after this block
    if ((i + 1) % RETARGET_INTERVAL === 0) {
      const lastIndex = i;
      const firstIndex = i - RETARGET_INTERVAL + 1;

      const lastMTP = medianTimePastAt(lastIndex);
      const firstMTP = medianTimePastAt(firstIndex);

      let actualTimespan = lastMTP - firstMTP;
      if (actualTimespan < 1n) actualTimespan = 1n;

      // Clamp timespan
      const minTimespan = targetTimespan / MAX_ADJUST;
      const maxTimespan = targetTimespan * MAX_ADJUST;
      if (actualTimespan < minTimespan) actualTimespan = minTimespan;
      if (actualTimespan > maxTimespan) actualTimespan = maxTimespan;

      // Adjust difficulty target
      let newTarget = (currentTarget * actualTimespan) / targetTimespan;
      if (newTarget > STARTING_DIFF) newTarget = STARTING_DIFF;
      if (newTarget < 1n) newTarget = 1n;

      currentTarget = newTarget;
    }
  }

  return difficulties[difficulties.length - 1];
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
