const { Server } = require("socket.io");
const redis = require('./redis');
// Vault decommissioned.
const crypto = require('crypto');

class SocketService {
    constructor() {
        this.io = null;
        this.connectedAdmins = new Set();
    }

    init(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.io.on("connection", (socket) => {
            console.log(`[Socket] New connection: ${socket.id}`);

            socket.on("auth_admin", (token) => {
                const adminToken = process.env.ADMIN_TOKEN;
                if (token === adminToken) {
                    socket.join("admins");
                    this.connectedAdmins.add(socket.id);
                    console.log(`[Socket] Socket ${socket.id} authenticated as ADMIN`);
                    
                    // Send initial dashboard state immediately
                    this._broadcastDashboardStats(socket.id);
                } else {
                    socket.emit("auth_error", "Unauthorized");
                }
            });

            socket.on("disconnect", () => {
                this.connectedAdmins.delete(socket.id);
                console.log(`[Socket] Disconnected: ${socket.id}`);
            });
        });

        // Background loop for real-time dashboard metrics (e.g. Volume, Wallets, Active trades)
        setInterval(() => this._broadcastDashboardStats(), 5000);
    }

    /**
     * Manual trigger for instant stats refresh
     */
    triggerStatsBroadcast() {
        this._broadcastDashboardStats();
    }

    /**
     * Broadcasts real-time events to all connected admins.
     */
    notifyAdmins(event, data) {
        if (!this.io) return;
        this.io.to("admins").emit(event, data);
    }

    /**
     * Broadcasts events to ALL clients (including users).
     * Useful for maintenance mode, trading halts, or global announcements.
     */
    broadcastAll(event, data) {
        if (!this.io) return;
        this.io.emit(event, data);
    }

    async _broadcastDashboardStats(socketId = null) {
        try {
            const blockchain = require('./blockchain');
            const history = await redis.getFullHistory();
            const activeTrades = await redis.getAllActiveTrades();
            
            const totalVolume = history.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            const totalWallets = new Set(history.map(t => t.user?.toLowerCase())).size;
            
            let treasuryBalance = 0;
            try {
                if (blockchain.wallet) {
                    const bal = await blockchain.getNativeBalance(blockchain.wallet.address);
                    const { ethers } = require('ethers');
                    treasuryBalance = parseFloat(ethers.formatEther(bal)) || 0;
                } else {
                    console.warn("[Socket] Blockchain wallet not ready for treasury sync.");
                }
            } catch (e) {
                console.warn("[Socket] Treasury sync failed:", e.message);
            }

            const stats = {
                totalVolume: totalVolume.toFixed(2),
                totalWallets,
                activeCount: activeTrades.length,
                activeStakesTotal: activeTrades.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0).toFixed(2),
                treasuryBalance: treasuryBalance.toFixed(2),
                pendingDisputes: 0, // Placeholder
                networkHealth: 'Operational',
                timestamp: Date.now()
            };


            const target = socketId ? this.io.to(socketId) : this.io.to("admins");
            target.emit("dashboard_stats", stats);
        } catch (e) {
            console.error("[Socket] Failed to broadcast dashboard stats:", e.message);
        }
    }

}

module.exports = new SocketService();
