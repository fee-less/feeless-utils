import pkg from "elliptic";
const { ec: EC } = pkg;
const ec = new EC("secp256k1");
import FeelessClient from "./client.js";
const MAX_SUPPLY = 100000000;
const STARTING_REWARD = 100;
const BLOCK_TIME = 30000;
const ADJUST_PERCENT = 0.1;
const POINTS = 5;
const DEV_FEE = 0.09;
const DEV_WALLET = "0217821bc151c94d80290bd4610e283aa4ba1fb411bb8d40d1072fd0ace5a6b9a3";
const STARTING_DIFF = BigInt("0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
const BASE_MINT_FEE = FLSStoFPoints(1000); // Minimum minting fee in fPoints
function FLSStoFPoints(flss) {
    return Math.round(flss * Math.pow(10, POINTS));
}
function fPointsToFLSS(fPoints) {
    return Number((fPoints / Math.pow(10, POINTS)).toFixed(POINTS));
}
function calculateReward(blockHeight) {
    const k = -STARTING_REWARD / MAX_SUPPLY;
    return STARTING_REWARD * Math.pow(Math.E, k * blockHeight);
}
function getDiff(blocks) {
    let DIFF = STARTING_DIFF;
    for (let i = 1; i < blocks.length; i++) {
        DIFF = BigInt(DIFF * BigInt(Math.round((blocks[i].timestamp - blocks[i - 1].timestamp > BLOCK_TIME ? 1 + ADJUST_PERCENT : 1 - ADJUST_PERCENT) * 100)) / 100n);
    }
    return DIFF;
}
function randomKeyPair() {
    const kp = ec.genKeyPair();
    return { pub: kp.getPublic().encode("hex", true), priv: kp.getPrivate().toString("hex") };
}
function getPublicKey(priv) {
    const kp = ec.keyFromPrivate(priv);
    return kp.getPublic().encode("hex", true);
}
// Calculate dynamic minting fee based on recent minting activity
function calculateMintFee(height, mints) {
    if (mints === 0 || height === 0)
        return BASE_MINT_FEE;
    return Math.max(1, BASE_MINT_FEE * (mints / height));
}
async function hashArgon(msg) {
    if (typeof window !== "undefined") {
        // We're in browser: do NOT import argon2
        throw new Error("argon2 hashing only supported in Node.js");
    }
    const argon2 = await import("argon2");
    const salt = Buffer.from('feeless-argon2-salt');
    const hashBuffer = await argon2.hash(msg, {
        raw: true,
        salt
    });
    const hexString = hashBuffer.toString('hex');
    return BigInt("0x" + hexString);
}
export { MAX_SUPPLY, STARTING_REWARD, BLOCK_TIME, ADJUST_PERCENT, POINTS, DEV_FEE, BASE_MINT_FEE, calculateMintFee, DEV_WALLET, STARTING_DIFF, FLSStoFPoints, fPointsToFLSS, calculateReward, getDiff, randomKeyPair, getPublicKey, hashArgon, FeelessClient };
