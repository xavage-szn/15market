// ─── OneSignal (phone notifications) client ─────────────────────────────────
// Single centralized module wrapping every OneSignal SDK call made by the app
// (OneSignal Web SDK v16 via `react-onesignal`). The SDK manages the browser
// push subscription; the backend targets users with include_external_user_ids,
// which is why we identify the browser with the user's wallet address on login.
import OneSignal from 'react-onesignal';

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

// OneSignal's service worker must not fight the PWA caching worker for root
// scope — it is hosted in a sub-path and registered at its own sub-scope.
// https://documentation.onesignal.com/docs/onesignal-service-worker
const SERVICE_WORKER_PATH = 'push/onesignal/OneSignalSDKWorker.js';
const SERVICE_WORKER_SCOPE = '/push/onesignal/';

// Remembers the user's decision so we don't re-prompt on every launch.
// 'yes' / 'no' / null (undecided).
const OPT_IN_KEY = '15market_push_opt_in';

let initPromise = null;
let consentPromptShown = false;
let permissionSyncRegistered = false;

export function isConfigured() {
  return Boolean(APP_ID && typeof window !== 'undefined');
}

export function getOptInPreference() {
  try {
    return localStorage.getItem(OPT_IN_KEY);
  } catch {
    return null;
  }
}

export function setOptInPreference(value) {
  try {
    localStorage.setItem(OPT_IN_KEY, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Initializes the OneSignal SDK (idempotent). Resolves when loaded. */
export function initOneSignal() {
  if (!isConfigured()) {
    console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID missing — phone notifications disabled.');
    return Promise.resolve();
  }
  if (!initPromise) {
    initPromise = OneSignal.init({
      appId: APP_ID,
      allowLocalhostAsSecureOrigin: true,
      autoResubscribe: true,
      serviceWorkerPath: SERVICE_WORKER_PATH,
      serviceWorkerParam: { scope: SERVICE_WORKER_SCOPE },
      welcomeNotification: { disable: true },
    })
      .then(() => {
        // Click-throughs on win/lose pushes land on the app root of this origin.
        OneSignal.Notifications.setDefaultUrl(`${window.location.origin}/`).catch(() => {});
        OneSignal.Notifications.setDefaultTitle('15MARKET').catch(() => {});
        registerPermissionSync();
      })
      .catch((err) => {
        console.error('[OneSignal] init failed:', err);
      });
  }
  return initPromise;
}

/**
 * Links this browser to the given wallet address (external id). The backend
 * sends win/lose pushes via include_external_user_ids: [address], so the ids
 * must match (both sides lowercase).
 */
export async function loginOneSignal(address) {
  if (!isConfigured() || !address) return;
  initOneSignal();
  try {
    await OneSignal.login(address.toLowerCase());
    console.log('[OneSignal] Identified user:', address.toLowerCase());
  } catch (e) {
    console.warn('[OneSignal] login failed:', e?.message || e);
  }
}

/** Unlinks this browser's subscription from the previous external id. */
export async function logoutOneSignal() {
  if (!isConfigured() || !initPromise) return;
  try {
    await OneSignal.logout();
    console.log('[OneSignal] Logged out.');
  } catch (e) {
    console.warn('[OneSignal] logout failed:', e?.message || e);
  }
}

/**
 * Shows OneSignal's slidedown consent UI. The native browser permission prompt
 * only fires after the user taps Allow — this app never pops permissions at
 * launch. OneSignal applies its own back-off logic to repeated prompts.
 */
export async function promptPushConsent({ force = false } = {}) {
  if (!isConfigured()) return;
  if (consentPromptShown && !force) return;
  consentPromptShown = true;
  try {
    await OneSignal.Slidedown.promptPush(force ? { force: true } : undefined);
  } catch (e) {
    console.warn('[OneSignal] consent prompt failed:', e?.message || e);
  }
}

/** Direct native permission request (for an explicit settings toggle). */
export async function requestPushPermission() {
  if (!isConfigured()) return false;
  try {
    const granted = await OneSignal.Notifications.requestPermission();
    setOptInPreference(granted ? 'yes' : 'no');
    return granted;
  } catch (e) {
    console.warn('[OneSignal] permission request failed:', e?.message || e);
    return false;
  }
}

/** Snapshot of the current push state for settings/debug UI. */
export function getPushStatus() {
  if (!isConfigured()) {
    return { configured: false, supported: false, granted: false, subscribed: false, subscriptionId: null };
  }
  let supported = false;
  try {
    supported = OneSignal.Notifications.isPushSupported();
  } catch {
    /* SDK not loaded yet */
  }
  const sub = OneSignal.User.PushSubscription;
  return {
    configured: true,
    supported,
    granted: Boolean(OneSignal.Notifications.permission),
    optedIn: Boolean(sub?.optedIn),
    subscriptionId: sub?.id ?? null,
    token: sub?.token ?? null,
  };
}

/** Registers an onChange handler for the push subscription; returns a cleanup fn. */
export function onPushSubscriptionChange(cb) {
  if (!isConfigured()) return () => {};
  OneSignal.User.PushSubscription.addEventListener('change', cb);
  return () => OneSignal.User.PushSubscription.removeEventListener('change', cb);
}

// Keeps the local opt-in preference in sync with the native permission result.
function registerPermissionSync() {
  if (permissionSyncRegistered) return;
  permissionSyncRegistered = true;
  OneSignal.Notifications.addEventListener('permissionChange', (granted) => {
    setOptInPreference(granted ? 'yes' : 'no');
  });
}