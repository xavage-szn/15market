const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\HP\\Documents\\15market\\15market-ui\\src\\UserApp.jsx', 'utf8');

try {
    // This isn't perfect for JSX but will catch basic brace mismatches
    let braces = 0;
    let parens = 0;
    for (let char of content) {
        if (char === '{') braces++;
        if (char === '}') braces--;
        if (char === '(') parens++;
        if (char === ')') parens--;
    }
    console.log(`Braces: ${braces}, Parens: ${parens}`);
} catch (e) {
    console.error(e);
}
