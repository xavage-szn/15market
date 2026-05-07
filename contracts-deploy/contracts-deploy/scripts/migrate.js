import hre from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: "../../nexus-core/.env" });

const OLD_TREASURY = process.env.TREASURY_ADDRESS;
const ENV_PATH = path.resolve("../../nexus-core/.env");

// Minimal ABI to drain old contract
const OLD_ABI = [
  "function withdraw(uint256 _amount) external",
  "receive() external payable"
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  console.log("\n🔑 Deployer:", deployerAddr);
  console.log("📦 Old Contract:", OLD_TREASURY);

  // --- Step 1: Check old contract balance ---
  const provider = deployer.provider;
  const oldBalWei = await provider.getBalance(OLD_TREASURY);
  const oldBal = ethers.formatEther(oldBalWei);
  console.log(`\n💰 Old Treasury Balance: ${oldBal} ETH (USDC equivalent)`);

  // --- Step 2: Deploy new contract ---
  console.log("\n🚀 Deploying new ArcPrediction contract...");
  const ArcPrediction = await hre.ethers.getContractFactory("ArcPrediction");
  const newContract = await ArcPrediction.deploy();
  await newContract.waitForDeployment();
  const newAddress = await newContract.getAddress();
  console.log(`✅ New Contract Deployed: ${newAddress}`);

  // --- Step 3: Migrate funds from old → new ---
  if (BigInt(oldBalWei) > 0n) {
    console.log(`\n🔄 Migrating ${oldBal} ETH from old contract to new...`);

    // Create contract instance with hre signer (has provider + wallet)
    const oldContract = new hre.ethers.Contract(OLD_TREASURY, OLD_ABI, deployer);

    // Withdraw to deployer (owner)
    const withdrawTx = await oldContract.withdraw(oldBalWei, { gasLimit: 200000 });
    const withdrawReceipt = await withdrawTx.wait();
    console.log(`  ✅ Withdrawn | tx: ${withdrawTx.hash} | block: ${withdrawReceipt.blockNumber}`);

    // Forward to new contract
    const sendTx = await deployer.sendTransaction({
      to: newAddress,
      value: oldBalWei,
      gasLimit: 100000
    });
    await sendTx.wait();
    console.log(`  ✅ Funded new contract | tx: ${sendTx.hash}`);

    const newBal = await provider.getBalance(newAddress);
    console.log(`  💰 New Treasury Balance: ${ethers.formatEther(newBal)} ETH`);
  } else {
    console.log("\n  ⚠️  Old contract has zero balance — skipping fund migration.");
  }

  // --- Step 4: Update .env with new address ---
  console.log(`\n📝 Updating nexus-core/.env TREASURY_ADDRESS...`);
  let envContent = fs.readFileSync(ENV_PATH, "utf8");
  if (envContent.includes("TREASURY_ADDRESS=")) {
    envContent = envContent.replace(/TREASURY_ADDRESS=.*/, `TREASURY_ADDRESS=${newAddress}`);
  } else {
    envContent += `\nTREASURY_ADDRESS=${newAddress}`;
  }
  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`  ✅ .env updated → TREASURY_ADDRESS=${newAddress}`);

  console.log("\n🎉 Migration complete!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  OLD: ${OLD_TREASURY}`);
  console.log(`  NEW: ${newAddress}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ⚡ Restart nexus-core for the new address to take effect.\n");
}

main().catch((error) => {
  console.error("❌ Migration failed:", error.message);
  process.exitCode = 1;
});
