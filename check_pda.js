const { PublicKey } = require("@solana/web3.js");

const programID = new PublicKey("7e1dPQRBJwWpxcRDkp8PUQDGrb5m4RYHCYxSPcnuVmVe");

function getTreasuryPdaNode() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        programID
    );
}

function getTreasuryPdaUIStyle() {
    // TextEncoder is global in Node
    const encoder = new TextEncoder();
    return PublicKey.findProgramAddressSync(
        [encoder.encode("treasury")],
        programID
    );
}

const [pdaNode, bumpNode] = getTreasuryPdaNode();
const [pdaUI, bumpUI] = getTreasuryPdaUIStyle();

console.log("Program ID:", programID.toBase58());
console.log("Treasury PDA (Node Buffer):", pdaNode.toBase58(), "Bump:", bumpNode);
console.log("Treasury PDA (UI Encoder):", pdaUI.toBase58(), "Bump:", bumpUI);
