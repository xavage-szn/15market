const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    username TEXT,
    xUsername TEXT,
    onboarded INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS session_balances (
    address TEXT PRIMARY KEY,
    balance TEXT DEFAULT '0',
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    userAddress TEXT,
    amount TEXT,
    direction TEXT,
    entryPrice TEXT,
    exitPrice TEXT,
    status TEXT, -- PENDING, WON, LOST
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
