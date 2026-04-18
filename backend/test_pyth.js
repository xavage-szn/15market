const axios = require('axios');
const assets = [
  { id: 'btc', pyth: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { id: 'eth', pyth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  { id: 'sol', pyth: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' }
];

async function test() {
  try {
    const idsString = assets.map(a => `ids[]=${a.pyth}`).join('&');
    const url = `https://hermes.pyth.network/v2/updates/price/latest?${idsString}`;
    console.log("Testing URL:", url);
    const res = await axios.get(url);
    console.log("Response Status:", res.status);
    console.log("Parsed Count:", res.data.parsed ? res.data.parsed.length : 0);
    if (res.data.parsed) {
      res.data.parsed.forEach(p => {
        console.log(`- ${p.id}: ${p.price.price} * 10^${p.price.expo}`);
      });
    }
  } catch (e) {
    console.error("Test failed:", e.message);
    if (e.response) console.error("Response data:", e.response.data);
  }
}

test();
