// Single source of truth for "does this trade have a verdict yet?".
//
// Enumerating the SETTLED states and treating everything else as in-flight is
// deliberate. The previous logic listed the pending states (PENDING,
// RESOLVING, PUSH, QUEUED, OPEN) and treated the rest as settled, which
// mis-classified two real live states: LOCKED, set the moment a trade is placed
// before any outcome exists, and TIMEOUT, set when the backend is unreachable
// with payout '0.00' and won undefined. Both rendered a red LOST card.
//
// Any status the backend adds later defaults to in-flight, so an unknown value
// can never surface as a fabricated win or loss.
const SETTLED_STATUSES = ['WON', 'PAID', 'LOST', 'RESOLVED', 'PAYOUT_FAILED', 'CANCELLED'];
const WIN_STATUSES = ['WON', 'PAID'];

export function isTradeSettled(trade) {
  if (!trade) return false;
  if (trade.isPending) return false;
  const status = String(trade.status || '').toUpperCase();
  if (!status) return false; // no status yet — the verdict has not landed
  return SETTLED_STATUSES.includes(status);
}

// True while the trade is still running. The receipt card and its share button
// only exist for settled trades; everything else shows a disclaimer instead.
export function isTradeInFlight(trade) {
  return !!trade && !isTradeSettled(trade);
}

export function isWinningTrade(trade) {
  if (!isTradeSettled(trade)) return false;
  if (WIN_STATUSES.includes(String(trade.status || '').toUpperCase())) return true;
  return Number(trade.payout) > 0;
}
