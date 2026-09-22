// OneSignal Web Push service worker (v16).
// Hosted in a sub-directory + registered at a sub-scope (/push/onesignal/) so it
// does not conflict with the PWA caching worker (src/sw.js, root scope).
// Signature: OneSignal Web SDK — do not modify.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");