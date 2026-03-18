const hre = require("hardhat");

async function main() {
    const ArcRounds = await hre.ethers.getContractFactory("ArcRounds");
    const rounds = await ArcRounds.deploy();

    await rounds.waitForDeployment();

    console.log(
        `ArcRounds deployed to ${rounds.target}`
    );
    const fs = require('fs');
    fs.writeFileSync('deployed_address_rounds.txt', rounds.target);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
