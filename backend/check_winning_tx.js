const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const hash = '0x7ff4673936f5da80b440b27c2101dbaf40de434a5286b8fa49d94dc290a6bbd7';

async function checkTx() {
    try {
        const receipt = await provider.getTransactionReceipt(hash);
        console.log(`Receipt Status: ${receipt.status}`);

        // Let's get the BetSettled event details
        const abi = [
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];
        const iface = new (require('ethers').Interface)(abi);

        receipt.logs.forEach(log => {
            try {
                const parsed = iface.parseLog(log);
                if (parsed) {
                    console.log('Event:', parsed.name);
                    console.log('ID:', parsed.args.id.toString());
                    console.log('User:', parsed.args.user);
                    console.log('Payout:', formatEther(parsed.args.payout));
                    console.log('Won:', parsed.args.won);
                }
            } catch (e) { }
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

checkTx();
