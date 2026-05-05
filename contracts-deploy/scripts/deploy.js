import hre from "hardhat";

async function main() {
  console.log("🚀 Starting Deployment to Arc Network...");

  const ArcPrediction = await hre.ethers.getContractFactory("ArcPrediction");
  const contract = await ArcPrediction.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ ArcPrediction Deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
