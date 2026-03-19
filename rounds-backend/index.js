const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const processor = require('./src/processor');
const botService = require('./src/botService');
const redis = require('./src/redis');

const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3011;

app.use(cors());
app.use(express.json());

// Transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const isAdmin = (req) => req.headers['authorization'] === `Bearer ${process.env.ADMIN_TOKEN}`;

// --- ACCESS ENDPOINTS ---

app.post('/access/apply', async (req, res) => {
    try {
        const { address, xHandle, discord, email } = req.body;
        if (!address || !xHandle || !email) return res.status(400).json({ error: 'Missing required fields' });
        
        await redis.saveApplication({ address, xHandle, discord, email, timestamp: Date.now(), status: 'pending' });
        res.json({ success: true, message: 'Application submitted! Please check your email periodically for your access code.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/access/check/:address', async (req, res) => {
    const authorized = await redis.isAuthorized(req.params.address);
    res.json({ authorized });
});

app.post('/access/redeem', async (req, res) => {
    try {
        const { address, code } = req.body;
        if (!address || !code) return res.status(400).json({ error: 'Missing parameters' });
        
        const codeData = await redis.verifyCode(code.trim().toUpperCase());
        if (!codeData) return res.status(403).json({ error: 'Invalid or expired access code' });
        
        await redis.grantAccess(address);
        await redis.consumeCode(code.trim().toUpperCase());
        res.json({ success: true, message: 'Access granted! Welcome to the Rounds terminal.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN ONLY

app.get('/access/admin/applications', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const apps = await redis.getApplications();
    res.json(apps);
});

app.post('/access/admin/approve', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { address, email } = req.body;
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await redis.saveCode(code, { address, email });
    await redis.deleteApplication(address);

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Your 15Market Rounds Access Code',
        text: `Your application has been approved!\n\nAccess Code: ${code}\n\nRedeem it at https://15market.online to unlock the Rounds terminal.`,
        html: `<p>Your application has been approved!</p><h3>Access Code: <strong>${code}</strong></h3><p>Redeem it at <a href="https://15market.online">15market.online</a> to unlock the Rounds terminal.</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, code });
    } catch (e) {
        // Still return code if mail fails, so admin can manually give it
        res.json({ success: true, code, mailError: e.message });
    }
});

app.post('/access/admin/generate-independent', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await redis.saveCode(code, { type: 'independent' });
    res.json({ success: true, code });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'rounds-backend', timestamp: Date.now() });
});

app.get('/active', async (req, res) => {
    try {
        const assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        const states = {};
        for (const asset of assets) {
            states[asset] = await redis.getRound(`${asset}_state`);
        }
        res.json(states);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/history', async (req, res) => {
    try {
        // For now, we return the last few settled rounds from state
        // In a real production app, we'd use a Redis list or DB for history
        const assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        const history = [];
        for (const asset of assets) {
            const state = await redis.getRound(`${asset}_state`);
            if (state && state.live && state.live.result) {
                history.push({
                    id: state.live.id,
                    symbol: asset,
                    status: state.live.result,
                    lockPrice: state.live.lockPrice,
                    settlePrice: state.live.settlePrice,
                    timestamp: state.live.startTime,
                    type: 'rounds'
                });
            }
        }
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log(`[Rounds-Backend] 🚀 Running on port ${PORT}`);
    await botService.init();
    processor.start();
});
