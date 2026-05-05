import dotenv from "dotenv";
dotenv.config({ path: "../nexus-core/.env" });

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: "0.8.20",
  networks: {
    arc: {
      type: "http",
      url: process.env.ARC_RPC_1 || "https://rpc.testnet.arc.network",
      accounts: [PRIVATE_KEY]
    }
  }
};
