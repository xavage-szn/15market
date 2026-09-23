// ==================================================================================
// SETTLEMENT LOG — append-only audit trail for every settled trade
// ==================================================================================
// One JSON object per line in nexus-core/logs/settlement-YYYY-MM-DD.log
// Records entry, exit (from live price oracle at countdown zero),
// direction, result and payout so settlements can be audited.
// ==================================================================================
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function writeSettlement(record) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date(record.settledAt || Date.now()).toISOString().slice(0, 10);
    const file = path.join(LOG_DIR, `settlement-${day}.log`);
    fs.appendFile(file, JSON.stringify(record) + '\n', () => {});
  } catch (e) {
    // never let logging break settlement
  }
}

module.exports = { writeSettlement, LOG_DIR };
