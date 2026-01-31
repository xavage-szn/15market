const http = require('http');

class LogBridge {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
        this.setupInterceptors();
        this.startServer();
    }

    setupInterceptors() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const capture = (type, args) => {
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');

            const logEntry = {
                id: Date.now() + Math.random(),
                timestamp: new Date().toLocaleTimeString(),
                type,
                message
            };

            this.logs.push(logEntry);
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
        };

        console.log = (...args) => {
            capture('INFO', args);
            originalLog.apply(console, args);
        };

        console.error = (...args) => {
            capture('ERROR', args);
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            capture('WARN', args);
            originalWarn.apply(console, args);
        };
    }

    startServer() {
        const port = process.env.BRIDGE_PORT || 3005; // Customizable port
        const server = http.createServer((req, res) => {
            // CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.url === '/logs') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.logs));
            } else if (req.url === '/trade-ping' && req.method === 'POST') {
                this.handleBody(req, (data) => {
                    const { amount, network, id, expiry } = data;
                    if (id && expiry) {
                        console.log(`✨ [BET_DATA] ID:${id} | AMT:${amount} | EXP:${expiry} | NET:${network || 'arc'}`);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        server.listen(port, '0.0.0.0', () => {

            console.log("--------------------------------------------------");
            console.log(`📡 [ARC_LOG_BRIDGE] Terminal streaming active on port ${port}`);
            console.log(`🔗 Interface: http://localhost:${port}/logs`);
            console.log("--------------------------------------------------");

            // Initial log to confirm bridge is working
            this.logs.push({
                id: 'init',
                timestamp: new Date().toLocaleTimeString(),
                type: 'INFO',
                message: 'Arc Terminal Bridge Established. Streaming live data...'
            });
        });
    }

    handleBody(req, callback) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                callback(data);
            } catch (e) { console.error("Body parse error:", e.message); }
        });
    }
}

module.exports = new LogBridge();
