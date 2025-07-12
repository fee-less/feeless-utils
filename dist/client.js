import cryptoJS from 'crypto-js';
const { SHA256 } = cryptoJS;
import pkg from "elliptic";
const { ec: EC } = pkg;
import { DEV_WALLET } from "./utils.js";
const ec = new EC("secp256k1");
export class FeelessClient {
    constructor(node, nodeHttp, privateKey) {
        this.seenMsgs = [];
        this.ready = false;
        this.onblock = () => { };
        this.onutx = () => { };
        this.http = nodeHttp;
        this.ws = new WebSocket(node);
        this.keys = ec.keyFromPrivate(privateKey);
        this.pub = this.keys.getPublic().encode("hex", true);
        this.priv = privateKey;
    }
    init() {
        return new Promise(resolve => {
            this.ws.onopen = () => {
                this.ready = true;
                this.ws.addEventListener("message", (event) => {
                    if (this.seenMsgs.includes(SHA256(event.data.toString()).toString()))
                        return;
                    this.seenMsgs.push(SHA256(event.data.toString()).toString());
                    const pl = JSON.parse(event.data.toString());
                    if (pl.event === "block")
                        this.onblock(pl.data);
                    if (pl.event === "tx") {
                        const tx = pl.data;
                        this.onutx(tx);
                        // If there's an airdrop amount, create and push an airdrop transaction from mint to minter
                        if (tx.mint && tx.mint.airdrop > 0) {
                            const airdropTx = {
                                sender: "mint",
                                receiver: tx.sender, // Airdrop goes to the minter
                                amount: tx.mint.airdrop,
                                signature: "mint",
                                nonce: Math.round(Math.random() * 1e6),
                                timestamp: Date.now(),
                                token: tx.mint.token
                            };
                            this.onutx(airdropTx);
                        }
                    }
                });
                resolve(true);
            };
            this.ws.onerror = () => resolve(false);
        });
    }
    closeClient() {
        this.ws.close();
    }
    getPublic() { return this.pub; }
    getPrivate() { return this.priv; }
    signMessage(msg) { return this.keys.sign(SHA256(msg).toString()).toDER("hex"); }
    async pollBalance(token = "", includeMempool = false) {
        return await fetch(`${this.http}/${includeMempool ? 'balance-mempool' : 'balance'}/${this.pub}${token ? "." + encodeURIComponent(token) : ""}`).then(res => res.text()).then(bal => parseInt(bal));
    }
    async getBlockHeight() {
        return await fetch(`${this.http}/height`).then(res => res.json()).then(height => parseInt(height.height));
    }
    async getDiff() {
        return await fetch(`${this.http}/diff`).then(res => res.json()).then(diff => BigInt("0x" + diff.diff));
    }
    async getBlock(height) {
        return await fetch(`${this.http}/block/${height}`).then(res => res.json()).then(b => b);
    }
    async getMempool() {
        return await fetch(`${this.http}/mempool`).then(res => res.json()).then(mempool => mempool);
    }
    async getTokens() {
        return await fetch(`${this.http}/tokens/${this.pub}`).then(res => res.json()).then(tokens => tokens);
    }
    async getTokenInfo(token) {
        return await fetch(`${this.http}/token-info/${token}`).then(res => res.json()).then(token => token);
    }
    async getTokenInfoByI(i) {
        return await fetch(`${this.http}/token/${i}`).then(res => res.json()).then(token => token);
    }
    async getTokenCount() {
        return await fetch(`${this.http}/token-count`).then(res => res.json()).then(r => r.count);
    }
    async getMintFee() {
        return await fetch(`${this.http}/mint-fee`).then(res => res.json()).then(fee => parseInt(fee.fee));
    }
    async placeTX(receiver, amountFPoints, token = "") {
        if (!this.ready)
            throw new Error("FeeleesClient.init() must be called before accessing any WS events");
        const tx = {
            sender: this.pub,
            receiver: receiver,
            amount: amountFPoints,
            signature: "",
            nonce: Math.round(Math.random() * 1e6),
            timestamp: Date.now()
        };
        if (token)
            tx.token = token;
        tx.signature = this.keys.sign(SHA256(JSON.stringify(tx)).toString()).toDER("hex");
        const pl = {
            event: "tx",
            data: tx
        };
        this.ws.send(JSON.stringify(pl));
        return this.waitForMessage(JSON.stringify(pl));
    }
    async submitBlock(block) {
        const pl = {
            event: "block",
            data: block
        };
        this.ws.send(JSON.stringify(pl));
        return this.waitForMessage(JSON.stringify(pl));
    }
    async mintToken(tokenMint) {
        if (!this.ready)
            throw new Error("FeeleesClient.init() must be called before accessing any WS events");
        // Then send the token minting transaction
        const mintTx = {
            sender: this.pub,
            receiver: DEV_WALLET,
            amount: await this.getMintFee(),
            signature: "",
            nonce: Math.round(Math.random() * 1e6),
            timestamp: Date.now(),
            mint: tokenMint
        };
        const mintPl = {
            event: "tx",
            data: mintTx
        };
        this.ws.send(JSON.stringify(mintPl));
        return this.waitForMessage(JSON.stringify(mintPl));
    }
    async getHistory() {
        return await fetch(`${this.http}/history/${this.pub}`).then(res => res.json());
    }
    async searchBlockByHash(hash) {
        const response = await fetch(`${this.http}/search-blocks/${hash}`);
        const data = await response.json();
        if (data.error)
            throw new Error(data.error);
        return data;
    }
    async searchTransaction(query) {
        const response = await fetch(`${this.http}/search-tx/${query}`);
        const data = await response.json();
        if (data.error)
            throw new Error(data.error);
        return data;
    }
    async getAddressHistory(address) {
        const response = await fetch(`${this.http}/history/${address}`);
        const data = await response.json();
        if (data.error)
            throw new Error(data.error);
        return data;
    }
    // Private
    waitForMessage(expectedMessage, timeoutMs = 10000) {
        if (!this.ready)
            throw new Error("FeeleesClient.init() must be called before accessing any WS events");
        return new Promise((resolve, reject) => {
            try {
                const timer = setTimeout(() => {
                    this.ws.removeEventListener('message', onMessage);
                    resolve(false);
                }, timeoutMs);
                const onMessage = (event) => {
                    const data = event.data.toString();
                    if (data === expectedMessage) {
                        clearTimeout(timer);
                        this.ws.removeEventListener('message', onMessage);
                        resolve(true);
                    }
                };
                this.ws.addEventListener('message', onMessage);
            }
            catch (e) {
                reject(false);
            }
            ;
        });
    }
}
export default FeelessClient;
