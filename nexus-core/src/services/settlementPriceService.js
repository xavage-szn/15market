/**
 * SETTLEMENT PRICE SERVICE
 * ------------------------
 * Dedicated price feed for the Classic Engine (trade settlement).
 * Re-uses the core priceService which writes to the shared cache.
 * Both odds and settlement read from the same cache.prices / cache.priceHistory,
 * so a single poller is sufficient — but this file exists as a named module
 * so classic.js can require('./services/settlementPriceService') explicitly.
 */

const priceService = require('./priceService');

function startSettlement(io) {
    console.log('[SettlementPriceService] Using shared priceService for settlement feed...');
    // priceService.start(io) is already called in index.js — no duplicate polling.
    // This module exists so classic.js has a named import for the settlement price feed.
}

function stopSettlement() {
    // No-op — priceService.stop() handles cleanup.
}

module.exports = { startSettlement, stopSettlement, pollPrices: priceService.pollPrices };
