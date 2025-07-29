import { FeelessClient } from "./utils.js";

const fc = new FeelessClient(
  "ws://localhost:6061",
  "http://localhost:8000",
  "7e594f5c57e001302298751bb7d83e9118197dc148cbeeaccf3ed8718db9f7aa"
);

await fc.init();

// console.log(await fc.placeTXV2(fc.getPublic(), 100000, undefined, Date.now() + 120000));

console.log(await fc.pollBalance());
console.log(await fc.pollLocked());