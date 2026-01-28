const { PublicKey } = require('@solana/web3.js');
const oldPid = new PublicKey('7yZWzWwkc4JYkum1FSL37Peb9iKK9vyAciPbu3QzE1cP');
const [oldTreasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], oldPid);
console.log('Old Treasury PDA:', oldTreasury.toBase58());

const newPid = new PublicKey('9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe');
const [newTreasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], newPid);
console.log('New Treasury PDA:', newTreasury.toBase58());
