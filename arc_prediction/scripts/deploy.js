const hre = require("hardhat");

async function main() {
    const ArcPrediction = await hre.ethers.getContractFactory("ArcPrediction");
    const prediction = await ArcPrediction.deploy();

    await prediction.waitForDeployment();

    console.log(
        `ArcPrediction deployed to ${prediction.target}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
