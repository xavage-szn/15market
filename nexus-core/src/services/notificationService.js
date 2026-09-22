const { Resend } = require('resend');
const profiles = require('../profiles');

const resendApiKey = process.env.RESEND_API_KEY;
let resend = null;
if (resendApiKey) {
    try {
        resend = new Resend(resendApiKey);
        console.log('[NotificationService] Resend SDK initialized successfully.');
    } catch (e) {
        console.error('[NotificationService] Failed to initialize Resend:', e.message);
    }
} else {
    console.warn('[NotificationService] RESEND_API_KEY environment variable is not defined. Email notifications will be mock-logged.');
}

// ─── OneSignal (phone notifications) ──────────────────────────────────────
// The browser identifies itself to OneSignal via OneSignal.login(address) on
// the frontend (external_id = wallet address). Win/lose settlements then target
// the user server-side with include_external_user_ids. Requires the App API
// key from the dashboard (Settings > Keys & IDs).
const onesignalAppId = process.env.ONESIGNAL_APP_ID;
const onesignalApiKey = process.env.ONESIGNAL_API_KEY;
const onesignalReady = Boolean(onesignalAppId && onesignalApiKey);
if (onesignalReady) {
    console.log(`[NotificationService] OneSignal initialized (app ${onesignalAppId}).`);
} else {
    console.warn('[NotificationService] ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set. Phone push notifications disabled.');
}

let socketIo = null;

let notificationStats = { sent: 0, failed: 0, emailsSent: 0, emailsFailed: 0, pushSent: 0, pushFailed: 0 };

function init(io) {
    socketIo = io;
    console.log('[NotificationService] Socket.io reference initialized.');
}

function getEmailTemplate(title, message, type) {
    const typeColors = {
        success: '#249C6C',
        warning: '#FF8C00',
        info: '#3182CE',
        error: '#FF6B6B'
    };
    const color = typeColors[type] || '#249C6C';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>15MARKET - Notification</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@700;900&family=Inter:wght@400;600;700&display=swap');
            body {
                margin: 0;
                padding: 0;
                background-color: #070a09;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                color: #e2ece5;
                -webkit-font-smoothing: antialiased;
            }
            .wrapper { width: 100%; background-color: #070a09; padding: 40px 0; }
            .container { max-width: 600px; margin: 0 auto; background-color: #101613; border: 1px solid rgba(36, 156, 108, 0.15); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }
            .header { padding: 32px; text-align: center; background: linear-gradient(180deg, rgba(36, 156, 108, 0.1) 0%, rgba(36, 156, 108, 0) 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
            .logo { font-family: 'Comfortaa', cursive; font-weight: 900; font-size: 24px; color: #249C6C; text-decoration: none; letter-spacing: -0.5px; }
            .content { padding: 40px 32px; }
            .badge-wrapper { text-align: center; margin-bottom: 24px; }
            .badge { display: inline-block; padding: 8px 16px; border-radius: 12px; background-color: rgba(36, 156, 108, 0.1); border: 1px solid rgba(36, 156, 108, 0.2); color: #249C6C; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; }
            .title { font-family: 'Comfortaa', cursive; font-weight: 900; font-size: 22px; color: #ffffff; text-align: center; margin: 0 0 16px 0; }
            .message-card { background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 24px; margin-bottom: 32px; text-align: center; }
            .message-text { font-size: 15px; line-height: 1.6; color: rgba(226, 236, 229, 0.85); margin: 0; }
            .action-btn { display: block; width: 200px; margin: 0 auto; padding: 16px 0; background-color: #249C6C; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 13px; text-align: center; border-radius: 30px; text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s ease; box-shadow: 0 8px 24px rgba(36, 156, 108, 0.25); }
            .footer { padding: 32px; background-color: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.02); text-align: center; font-size: 11px; color: rgba(226, 236, 229, 0.35); }
            .footer p { margin: 0 0 8px 0; }
            .footer a { color: #249C6C; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="header">
                    <a href="https://15market.com" class="logo">15MARKET</a>
                </div>
                <div class="content">
                    <div class="badge-wrapper">
                        <span class="badge" style="color: ${color}; border-color: ${color}33; background-color: ${color}1a;">${type}</span>
                    </div>
                    <h2 class="title">${title}</h2>
                    <div class="message-card">
                        <p class="message-text">${message}</p>
                    </div>
                    <a href="https://15market.com/dashboard" class="action-btn">Launch Dashboard</a>
                </div>
                <div class="footer">
                    <p>&copy; 2026 15MARKET. All rights reserved.</p>
                    <p>You received this email because you are registered on 15MARKET.</p>
                    <p><a href="https://15market.com/settings">Manage Email Preferences</a></p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ─── OneSignal push dispatch ─────────────────────────────────────────────
// Fire-and-forget notification to every device the identified user has.
// Targeting uses the wallet address as external_id (lowercased to match the
// frontend's OneSignal.login(address.toLowerCase())).

async function sendOneSignalPush(addr, title, message, type = 'info') {
    if (!onesignalReady) return;
    const targetAddr = String(addr).toLowerCase();
    try {
        const payload = {
            app_id: onesignalAppId,
            name: `trade-${type}-${Date.now()}`,
            target_channel: 'push',
            include_external_user_ids: [targetAddr],
            headings: { en: title },
            contents: { en: message },
            web_push_topic: 'trade-settlement'
        };
        const res = await fetch('https://api.onesignal.com/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Authorization: `Key ${onesignalApiKey}`
            },
            body: JSON.stringify(payload)
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && (body.id || body.notification_id || body.errors === undefined)) {
            notificationStats.pushSent++;
            console.log(`[Notification-Push] OneSignal ${body.id || body.notification_id || 'sent'} → ${addr}.`);
        } else {
            notificationStats.pushFailed++;
            console.error(`[Notification-Push] OneSignal rejected for ${addr} (${res.status}):`,
                JSON.stringify(body).slice(0, 300));
        }
    } catch (e) {
        notificationStats.pushFailed++;
        console.error(`[Notification-Push] OneSignal send failed for ${addr}:`, e.message);
    }
}

async function notifyUser(userAddr, title, message, type = 'info', emailEnabled = false, pushEnabled = false) {
    if (!userAddr) return;
    const addr = userAddr.toLowerCase();

    const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        message,
        type,
        timestamp: Date.now(),
        read: false
    };

    console.log(`[Notification] Creating for ${addr}: "${title}" - ${message}`);

    try {
        const profile = profiles.get(addr);
        if (profile) {
            profile.notifications = profile.notifications || [];
            profile.notifications.unshift(notification);
            if (profile.notifications.length > 50) {
                profile.notifications = profile.notifications.slice(0, 50);
            }
            profiles.upsert(addr, { notifications: profile.notifications });
        } else {
            profiles.upsert(addr, { notifications: [notification] });
        }
        notificationStats.sent++;
    } catch (e) {
        console.error(`[Notification] Failed to persist notification for ${addr}:`, e.message);
        notificationStats.failed++;
    }

    try {
        if (socketIo) {
            socketIo.to(addr).emit('notification', notification);
        }
    } catch (e) {
        console.error(`[Notification] Failed to emit socket notification for ${addr}:`, e.message);
    }

    if (pushEnabled) {
        sendOneSignalPush(addr, title, message, type).catch(e => {
            console.error(`[Notification] Push send failed for ${addr}:`, e.message);
        });
    }

    if (emailEnabled) {
        sendNotificationEmail(addr, title, message, type, notification).catch(e => {
            console.error(`[Notification] Email send failed for ${addr}:`, e.message);
        });
    }
}

// Fires an in-app + phone push notification. Used for high-priority events
// (trade wins/losses) on settlement paths.
async function notifyUserWithPush(userAddr, title, message, type = 'info') {
    return notifyUser(userAddr, title, message, type, false, true);
}

async function sendNotificationEmail(addr, title, message, type, notification) {
    try {
        const profile = profiles.get(addr);
        let emailAddress = profile?.email || profile?.verifiedEmail || null;

        if (!emailAddress) {
            if (process.env.TEST_EMAIL) {
                emailAddress = process.env.TEST_EMAIL;
            } else if (process.env.NODE_ENV !== 'production') {
                emailAddress = 'delivered@resend.dev';
            }
        }

        if (!emailAddress || !resend) return;

        const htmlContent = getEmailTemplate(title, message, type);
        const eventType = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const idempotencyKey = `${eventType}/${notification.id}`;

        console.log(`[Notification-Email] Sending to ${emailAddress} for ${addr}...`);
        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || '15MARKET <onboarding@resend.dev>',
            to: [emailAddress],
            subject: `15MARKET: ${title}`,
            html: htmlContent,
            idempotencyKey: idempotencyKey
        });

        if (error) {
            console.error('[Notification-Email] Resend error:', error.message);
            notificationStats.emailsFailed++;
        } else {
            console.log('[Notification-Email] Sent. ID:', data.id);
            notificationStats.emailsSent++;
        }
    } catch (emailErr) {
        console.error('[Notification-Email] Error:', emailErr.message);
        notificationStats.emailsFailed++;
    }
}

function getOtpEmailTemplate(code) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>15MARKET - Email Verification</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@700;900&family=Inter:wght@400;600;700;900&display=swap');
            body { margin: 0; padding: 0; background-color: #070a09; font-family: 'Inter', sans-serif; color: #e2ece5; -webkit-font-smoothing: antialiased; }
            .wrapper { width: 100%; background-color: #070a09; padding: 40px 0; }
            .container { max-width: 600px; margin: 0 auto; background-color: #101613; border: 1px solid rgba(36, 156, 108, 0.15); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }
            .header { padding: 40px 32px 32px; text-align: center; background: linear-gradient(180deg, rgba(36, 156, 108, 0.1) 0%, rgba(36, 156, 108, 0) 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
            .logo { font-family: 'Comfortaa', cursive; font-weight: 900; font-size: 28px; color: #249C6C; text-decoration: none; letter-spacing: -0.5px; }
            .content { padding: 40px 32px; }
            .title { font-family: 'Comfortaa', cursive; font-weight: 900; font-size: 22px; color: #ffffff; text-align: center; margin: 0 0 8px 0; }
            .subtitle { font-size: 13px; color: rgba(226, 236, 229, 0.5); text-align: center; margin: 0 0 32px 0; font-weight: 400; }
            .code-card { background: rgba(36, 156, 108, 0.08); border: 1px solid rgba(36, 156, 108, 0.2); border-radius: 20px; padding: 32px; margin-bottom: 32px; text-align: center; }
            .code-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: rgba(226, 236, 229, 0.4); margin-bottom: 16px; }
            .code { font-family: 'Inter', monospace; font-weight: 900; font-size: 42px; letter-spacing: 12px; color: #249C6C; margin: 0; line-height: 1.2; text-shadow: 0 0 30px rgba(36, 156, 108, 0.3); }
            .instructions { background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 24px; margin-bottom: 32px; }
            .instructions p { font-size: 14px; line-height: 1.7; color: rgba(226, 236, 229, 0.75); margin: 0; }
            .instructions strong { color: #e2ece5; font-weight: 700; }
            .footer { padding: 32px; background-color: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.02); text-align: center; font-size: 11px; color: rgba(226, 236, 229, 0.35); }
            .footer p { margin: 0 0 8px 0; }
            .footer a { color: #249C6C; text-decoration: none; }
            .expiry-note { font-size: 11px; color: rgba(226, 236, 229, 0.3); text-align: center; margin-top: 16px; }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="header">
                    <a href="https://15market.com" class="logo">15MARKET</a>
                </div>
                <div class="content">
                    <h2 class="title">Verify Your Email</h2>
                    <p class="subtitle">Use the code below to complete your verificaion.</p>
                    <div class="code-card">
                        <div class="code-label">Verification Code</div>
                        <div class="code">${code}</div>
                    </div>
                    <div class="instructions">
                        <p>Enter this <strong>one-time code</strong> on the application page. This code will expire in <strong>10 minutes</strong>.</p>
                    </div>
                    <p class="expiry-note">If you did not request this code, ignore this email.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2026 15MARKET. All rights reserved.</p>
                    <p><a href="https://15market.com">15market.com</a></p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

async function sendOtpEmail(emailAddress, code) {
    if (!resend) {
        console.log(`[OTP-Email] Resend not configured. Would send code ${code} to ${emailAddress}`);
        return true;
    }
    try {
        const htmlContent = getOtpEmailTemplate(code);
        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || '15MARKET <onboarding@resend.dev>',
            to: [emailAddress],
            subject: '15MARKET: Your Email Verification Code',
            html: htmlContent
        });
        if (error) {
            console.error('[OTP-Email] Resend error:', error.message);
            return false;
        }
        console.log('[OTP-Email] Sent to', emailAddress, 'ID:', data?.id);
        return true;
    } catch (err) {
        console.error('[OTP-Email] Failed:', err.message);
        return false;
    }
}

function getStats() {
    return { ...notificationStats };
}

module.exports = {
    init,
    notifyUser,
    notifyUserWithPush,
    sendOneSignalPush,
    sendOtpEmail,
    getStats
};
