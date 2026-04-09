const blockchain = require('./src/services/blockchain');
console.log('getPastEvents type:', typeof blockchain.getPastEvents);
if (typeof blockchain.getPastEvents === 'function') {
    console.log('SUCCESS: getPastEvents is a function');
} else {
    console.log('FAILURE: getPastEvents is not a function');
}
process.exit(0);
