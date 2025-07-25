import cryptoJS from 'crypto-js';
const { SHA256 } = cryptoJS;
import pkg from "elliptic";
import type { ec as ECType } from "elliptic";
const { ec: EC } = pkg;
import { EventPayload, Transaction, Block, DEV_WALLET, TokenMint, MintedTokenEntry } from "./utils.js";

const ec = new EC("secp256k1");

interface TransactionHistory {
  type: 'send' | 'receive' | 'mint';
  amount: number;
  token?: string;
  timestamp: number;
  status: 'confirmed' | 'pending';
  address: string;
  blockHeight?: number;
}

interface SearchBlockResult {
  block: Block;
  height: number;
}

interface SearchTransactionResult {
  tx: Transaction;
  blockHeight?: number;
}

interface SearchResults {
  results: SearchTransactionResult[];
}

export class FeelessClient {
  private ws: WebSocket;
  private keys: ECType.KeyPair;
  private priv: string;
  private pub: string;
  private http: string;
  private seenMsgs: string[] = [];
  public ready: boolean = false;
  public onblock: (block: Block) => void = () => {};
  public onutx: (tx: Transaction) => void = () => {};
  public timeout = 2000;

  constructor(node: string, nodeHttp: string, privateKey: string) {
    this.http = nodeHttp;
    this.ws = new WebSocket(node);
    this.keys = ec.keyFromPrivate(privateKey);
    this.pub = this.keys.getPublic().encode("hex", true);
    this.priv = privateKey;
  }

  init() {
    return new Promise<boolean>((resolve) => {
      this.ws.onopen = () => {
        this.ready = true;
        this.ws.addEventListener("message", (event: any) => {
          if (this.seenMsgs.includes(SHA256(event.data.toString()).toString()))
            return;
          this.seenMsgs.push(SHA256(event.data.toString()).toString());
          const pl: EventPayload = JSON.parse(event.data.toString());
          if (pl.event === "block") this.onblock(pl.data as Block);
          if (pl.event === "tx") {
            const tx = pl.data as Transaction;
            this.onutx(tx);
            // If there's an airdrop amount, create and push an airdrop transaction from mint to minter
            if (tx.mint && tx.mint.airdrop > 0) {
              const airdropTx: Transaction = {
                sender: "mint",
                receiver: tx.sender, // Airdrop goes to the minter
                amount: tx.mint.airdrop,
                signature: "mint",
                nonce: Math.round(Math.random() * 1e6),
                timestamp: Date.now(),
                token: tx.mint.token,
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

  getPublic() {
    return this.pub;
  }

  getPrivate() {
    return this.priv;
  }

  signMessage(msg: string) {
    return this.keys.sign(SHA256(msg).toString()).toDER("hex");
  }

  async pollBalance(
    token: string = "",
    includeMempool = false
  ): Promise<number> {
    return await fetch(
      `${this.http}/${includeMempool ? "balance-mempool" : "balance"}/${
        this.pub
      }${token ? "." + encodeURIComponent(token) : ""}`
    )
      .then((res) => res.text())
      .then((bal) => parseInt(bal));
  }

  async getBlockHeight(): Promise<number> {
    return await fetch(`${this.http}/height`)
      .then((res) => res.json())
      .then((height) => parseInt(height.height));
  }

  async getDiff(): Promise<bigint> {
    return await fetch(`${this.http}/diff`)
      .then((res) => res.json())
      .then((diff) => BigInt("0x" + diff.diff));
  }

  async getBlock(height: number): Promise<Block> {
    return await fetch(`${this.http}/block/${height}`)
      .then((res) => res.json())
      .then((b) => b);
  }

  async getMempool(): Promise<Transaction[]> {
    return await fetch(`${this.http}/mempool`)
      .then((res) => res.json())
      .then((mempool) => mempool);
  }

  async getTokens(): Promise<string[]> {
    return await fetch(`${this.http}/tokens/${this.pub}`)
      .then((res) => res.json())
      .then((tokens) => tokens);
  }

  async getTokenInfo(token: string): Promise<MintedTokenEntry> {
    return await fetch(`${this.http}/token-info/${token}`)
      .then((res) => res.json())
      .then((token) => token);
  }

  async getTokenInfoByI(i: number): Promise<MintedTokenEntry> {
    return await fetch(`${this.http}/token/${i}`)
      .then((res) => res.json())
      .then((token) => token);
  }

  async getTokenCount(): Promise<MintedTokenEntry> {
    return await fetch(`${this.http}/token-count`)
      .then((res) => res.json())
      .then((r) => r.count);
  }

  async getMintFee(): Promise<number> {
    return await fetch(`${this.http}/mint-fee`)
      .then((res) => res.json())
      .then((fee) => parseInt(fee.fee));
  }

  async placeTX(
    receiver: string,
    amountFPoints: number,
    token = ""
  ): Promise<boolean> {
    if (!this.ready)
      throw new Error(
        "FeeleesClient.init() must be called before accessing any WS events"
      );
    const tx: Transaction = {
      sender: this.pub,
      receiver: receiver,
      amount: amountFPoints,
      signature: "",
      nonce: Math.round(Math.random() * 1e6),
      timestamp: Date.now(),
    };
    if (token) tx.token = token;
    tx.signature = this.keys
      .sign(SHA256(JSON.stringify(tx)).toString())
      .toDER("hex");
    const pl: EventPayload = {
      event: "tx",
      data: tx,
    };
    this.ws.send(JSON.stringify(pl));
    return this.waitForMessage(JSON.stringify(pl));
  }

  async placeTXV2(
    receiver: string,
    amountFPoints: number,
    token = ""
  ): Promise<null | string> {
    // V2 Returns Signature that can be used to search TX later.
    if (!this.ready)
      throw new Error(
        "FeeleesClient.init() must be called before accessing any WS events"
      );
    const tx: Transaction = {
      sender: this.pub,
      receiver: receiver,
      amount: amountFPoints,
      signature: "",
      nonce: Math.round(Math.random() * 1e6),
      timestamp: Date.now(),
    };
    if (token) tx.token = token;
    tx.signature = this.keys
      .sign(SHA256(JSON.stringify(tx)).toString())
      .toDER("hex");
    const pl: EventPayload = {
      event: "tx",
      data: tx,
    };
    this.ws.send(JSON.stringify(pl));
    if (!this.waitForMessage(JSON.stringify(pl))) return null;
    return tx.signature;
  }

  async submitBlock(block: Block): Promise<boolean> {
    const pl: EventPayload = {
      event: "block",
      data: block,
    };
    this.ws.send(JSON.stringify(pl));
    return this.waitForMessage(JSON.stringify(pl));
  }

  async mintToken(tokenMint: TokenMint): Promise<boolean> {
    if (!this.ready)
      throw new Error(
        "FeeleesClient.init() must be called before accessing any WS events"
      );

    // Then send the token minting transaction
    const mintTx: Transaction = {
      sender: this.pub,
      receiver: DEV_WALLET,
      amount: await this.getMintFee(),
      signature: "",
      nonce: Math.round(Math.random() * 1e6),
      timestamp: Date.now(),
      mint: tokenMint,
    };
    const mintPl: EventPayload = {
      event: "tx",
      data: mintTx,
    };
    this.ws.send(JSON.stringify(mintPl));
    return this.waitForMessage(JSON.stringify(mintPl));
  }

  async getHistory(): Promise<TransactionHistory[]> {
    return await fetch(`${this.http}/history/${this.pub}`).then((res) =>
      res.json()
    );
  }

  async searchBlockByHash(hash: string): Promise<SearchBlockResult> {
    const response = await fetch(`${this.http}/search-blocks/${hash}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async searchTransaction(query: string): Promise<SearchResults> {
    const response = await fetch(`${this.http}/search-tx/${query}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async getAddressHistory(address: string): Promise<TransactionHistory[]> {
    const response = await fetch(`${this.http}/history/${address}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // Private
  private waitForMessage(
    expectedMessage: string,
    timeoutMs = -1
  ): Promise<boolean> {
    if (timeoutMs === -1) timeoutMs = this.timeout;
    if (!this.ready)
      throw new Error(
        "FeeleesClient.init() must be called before accessing any WS events"
      );
    return new Promise((resolve, reject) => {
      try {
        const timer = setTimeout(() => {
          this.ws.removeEventListener("message", onMessage as any);
          resolve(false);
        }, timeoutMs);

        const onMessage = (event: MessageEvent) => {
          const data = event.data.toString();
          if (data === expectedMessage) {
            clearTimeout(timer);
            this.ws.removeEventListener("message", onMessage as any);
            resolve(true);
          }
        };

        this.ws.addEventListener("message", onMessage as any);
      } catch (e) {
        reject(false);
      }
    });
  }
}

export default FeelessClient;
export type { SearchBlockResult, SearchTransactionResult, SearchResults, TransactionHistory };