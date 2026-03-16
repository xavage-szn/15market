const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function checkBet() {
    const hash = '0xd6ae6e211fd14a36d69b0f782d260804e63bcfc7a836404f55d76251c8739e9f';
    try {
        const receipt = await provider.getTransactionReceipt(hash);
        const iface = contract.interface;
        receipt.logs.forEach(log => {
            const parsed = iface.parseLog(log);
            if (parsed) {
                console.log(`BetID: ${parsed.args.id}`);
                console.log(`Duration: ${parsed.args.duration.toString()} seconds`);
                console.log(`Amount: ${formatEther(parsed.args.amount)} USDC`);
            }
        });
    } catch (e) {
        console.error(e.message);
    }
}

checkBet();
