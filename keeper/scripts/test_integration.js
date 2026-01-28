const { program, readConnection, START_TIME } = require("../src/config");
const bs58 = require("bs58");

const BET_DISCRIMINATOR = bs58.encode(Buffer.from([147, 23, 35, 59, 15, 75, 155, 32]));

async function testIntegration() {
    console.log(`[TEST] Checking connection to: ${readConnection.rpcEndpoint}`);
    console.log(`[TEST] Program ID: ${program.programId.toBase58()}`);
    console.log(`[TEST] START_TIME: ${START_TIME}`);

    try {
        const filters = [
            {
                memcmp: {
                    offset: 0,
                    bytes: BET_DISCRIMINATOR
                }
            }
        ];

        const accounts = await readConnection.getProgramAccounts(program.programId, {
            filters,
            commitment: "confirmed"
        });

        console.log(`[TEST] Found ${accounts.length} total bet accounts on-chain.`);

        let activeCount = 0;
        let futureCount = 0;

        for (const { pubkey, account } of accounts) {
            try {
                const decoded = program.coder.accounts.decode("bet", account.data);
                if (decoded.resolved) continue;

                const ts = decoded.timestamp.toNumber();
                if (ts >= START_TIME) {
                    futureCount++;
                    console.log(`[TEST] 🌟 Found NEW pending bet: ${pubkey.toBase58()}`);
                } else {
                    activeCount++;
                }
            } catch (e) { }
        }

        console.log(`[TEST] Summary:`);
        console.log(`       - Legacy pending bets (ignored): ${activeCount}`);
        console.log(`       - New pending bets (to be monitored): ${futureCount}`);

        console.log(`✅ [TEST] Integration check complete.`);
    } catch (e) {
        console.error(`❌ [TEST] Integration failed: ${e.message}`);
    }
}

testIntegration();
