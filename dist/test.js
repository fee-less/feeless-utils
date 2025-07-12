import { FeelessClient } from "./utils.js";
const fc = new FeelessClient("ws://localhost:6061", "http://localhost:8000", "1aa37a7e1a3a3c10302c6643f48a37c4d9e19e2432850443dd3b33f12dfecc89a4");
await fc.init();
fc.closeClient();
