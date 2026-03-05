const fs = require('fs');

fetch('https://15market.online/')
    .then(r => r.text())
    .then(html => {
        const scripts = [...html.matchAll(/src="(\/assets\/index-.*?\.js)"/g)].map(m => m[1]);
        if (scripts.length > 0) {
            return fetch('https://15market.online' + scripts[0]);
        }
    })
    .then(r => r ? r.text() : '')
    .then(js => {
        if (js.includes('Verifying Session Trade on Arc...')) {
            console.log('✅ CURRENT CODE IS DEPLOYED TO PRODUCTION');
        } else {
            console.log('❌ OLD CODE IS STILL ON PRODUCTION');
        }
    })
    .catch(console.error);
