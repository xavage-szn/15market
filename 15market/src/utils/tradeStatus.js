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
const IN_FLIGHT_STATUSES = ['PENDING', 'RESOLVING'];

// How long past its countdown a trade may stay unsettled before the platform is
// considered to have failed it.
//
// This is NOT a settlement deadline - the backend still owes a real verdict and
// the trade stays PENDING in the list until it arrives or an admin clears it in
// disputes. Nothing here ever invents a win or a loss. It only decides how long
// an unsettled trade may keep HOLDING THE TRADING CONTROLS.
//
// A trade that is still running legitimately blocks the widget so the user
// cannot stack a second stake on top of an unresolved one. A trade the backend
// has already failed to settle must not: it used to hold the widget forever,
// leaving the user unable to trade at all with no way out and nothing on screen
// to explain why.
export const SETTLE_GRACE_MS = 30000;

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

// A trade the backend has had ample time to settle and has not.
export function isTradeOverdue(trade, now = Date.now()) {
  if (!trade) return false;
  if (isTradeSettled(trade)) return false;
  if (!IN_FLIGHT_STATUSES.includes(String(trade.status || '').toUpperCase())) return false;

  // Timestamps reach us as seconds from the backend and as milliseconds from
  // the optimistic rows we create locally, so normalise before comparing.
  const rawStart = Number(trade.startTime || trade.timestamp || 0);
  if (!rawStart) return false; // no timing information — never guess
  const start = rawStart > 1e12 ? rawStart : rawStart * 1000;
  const duration = Number(trade.duration || 15);
  const expiry = Number(trade.expiryMs || 0) || (start + duration * 1000);

  return now > expiry + SETTLE_GRACE_MS;
}

export function isWinningTrade(trade) {
  if (!isTradeSettled(trade)) return false;
  if (WIN_STATUSES.includes(String(trade.status || '').toUpperCase())) return true;
  return Number(trade.payout) > 0;
}
