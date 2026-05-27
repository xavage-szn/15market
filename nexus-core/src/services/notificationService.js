const { Resend } = require('resend');
const profiles = require('../profiles');

// Initialize Resend Client
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

// Store a reference to the socket.io instance
let socketIo = null;

/**
 * Initialize NotificationService with Socket.io reference
 * @param {object} io - socket.io instance
 */
function init(io) {
    socketIo = io;
    console.log('[NotificationService] Socket.io reference initialized.');
}

/**
 * Generates a beautiful HTML email template matching 15MARKET's premium dark forest theme.
 * @param {string} title - Email header title
 * @param {string} message - Email body message
 * @param {string} type - Notification type ('success', 'warning', 'info', 'error')
 * @returns {string} - HTML content
 */
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
            .wrapper {
                width: 100%;
                background-color: #070a09;
                padding: 40px 0;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #101613;
                border: 1px solid rgba(36, 156, 108, 0.15);
                border-radius: 24px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            }
            .header {
                padding: 32px;
                text-align: center;
                background: linear-gradient(180deg, rgba(36, 156, 108, 0.1) 0%, rgba(36, 156, 108, 0) 100%);
                border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            }
            .logo {
                font-family: 'Comfortaa', cursive;
                font-weight: 900;
                font-size: 24px;
                color: #249C6C;
                text-decoration: none;
                letter-spacing: -0.5px;
            }
            .content {
                padding: 40px 32px;
            }
            .badge-wrapper {
                text-align: center;
                margin-bottom: 24px;
            }
            .badge {
                display: inline-block;
                padding: 8px 16px;
                border-radius: 12px;
                background-color: rgba(36, 156, 108, 0.1);
                border: 1px solid rgba(36, 156, 108, 0.2);
                color: #249C6C;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1.5px;
            }
            .title {
                font-family: 'Comfortaa', cursive;
                font-weight: 900;
                font-size: 22px;
                color: #ffffff;
                text-align: center;
                margin: 0 0 16px 0;
            }
            .message-card {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 16px;
                padding: 24px;
                margin-bottom: 32px;
                text-align: center;
            }
            .message-text {
                font-size: 15px;
                line-height: 1.6;
                color: rgba(226, 236, 229, 0.85);
                margin: 0;
            }
            .action-btn {
                display: block;
                width: 200px;
                margin: 0 auto;
                padding: 16px 0;
                background-color: #249C6C;
                color: #ffffff !important;
                text-decoration: none;
                font-weight: 700;
                font-size: 13px;
                text-align: center;
                border-radius: 30px;
                text-transform: uppercase;
                letter-spacing: 1px;
                transition: all 0.2s ease;
                box-shadow: 0 8px 24px rgba(36, 156, 108, 0.25);
            }
            .footer {
                padding: 32px;
                background-color: rgba(0, 0, 0, 0.2);
                border-top: 1px solid rgba(255, 255, 255, 0.02);
                text-align: center;
                font-size: 11px;
                color: rgba(226, 236, 229, 0.35);
            }
            .footer p {
                margin: 0 0 8px 0;
            }
            .footer a {
                color: #249C6C;
                text-decoration: none;
            }
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

/**
 * Creates a notification record for a user, broadcasts it via Socket.IO,
 * and sends an email via Resend if email is configured/linked.
 * 
 * @param {string} userAddr - The target user's EVM address
 * @param {string} title - The notification title
 * @param {string} message - The notification detailed description
 * @param {string} type - Notification category ('info', 'success', 'warning', 'error')
 */
async function notifyUser(userAddr, title, message, type = 'info') {
    if (!userAddr) return;
    const addr = userAddr.toLowerCase();
    
    // 1. Create notification object
    const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        message,
        type,
        timestamp: Date.now(),
        read: false
    };

    console.log(`[Notification] Creating for ${addr}: "${title}" - ${message}`);

    // 2. Fetch and update profile database
    const profile = profiles.get(addr);
    if (profile) {
        profile.notifications = profile.notifications || [];
        profile.notifications.unshift(notification);
        
        // Keep last 50 notifications to prevent database bloat
        if (profile.notifications.length > 50) {
            profile.notifications = profile.notifications.slice(0, 50);
        }
        
        profiles.upsert(addr, { notifications: profile.notifications });
    } else {
        // Create an empty profile to store the notification if they don't have one yet
        profiles.upsert(addr, { notifications: [notification] });
    }

    // 3. Emit real-time notification to client via Socket.IO
    if (socketIo) {
        socketIo.to(addr).emit('notification', notification);
        console.log(`[Notification] Emitted socket notification to ${addr}`);
    }

    // 4. Send Email Notification via Resend
    let emailAddress = profile?.email;
    
    // Support testing fallback if no email is set on profile
    if (!emailAddress) {
        if (process.env.TEST_EMAIL) {
            emailAddress = process.env.TEST_EMAIL;
            console.log(`[Notification-Email] No email set for ${addr}. Using env TEST_EMAIL fallback: ${emailAddress}`);
        } else if (process.env.NODE_ENV !== 'production') {
            // In local/dev testing, use Resend's standard sandbox delivered email address
            emailAddress = 'delivered@resend.dev';
            console.log(`[Notification-Email] No email set for ${addr}. Using Resend sandbox fallback: delivered@resend.dev`);
        }
    }

    if (emailAddress && resend) {
        try {
            console.log(`[Notification-Email] Sending Resend email to ${emailAddress}...`);
            const htmlContent = getEmailTemplate(title, message, type);
            
            // Format idempotency key: <event-type>/<entity-id>
            const eventType = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const idempotencyKey = `${eventType}/${notification.id}`;

            const { data, error } = await resend.emails.send({
                from: process.env.RESEND_FROM || '15MARKET <onboarding@resend.dev>',
                to: [emailAddress],
                subject: `15MARKET: ${title}`,
                html: htmlContent,
                idempotencyKey: idempotencyKey
            });

            if (error) {
                console.error('[Notification-Email] Resend SDK returned an error:', error.message);
            } else {
                console.log('[Notification-Email] Email successfully sent. ID:', data.id);
            }
        } catch (emailErr) {
            console.error('[Notification-Email] Network or processing error:', emailErr.message);
        }
    }
}

module.exports = {
    init,
    notifyUser
};
