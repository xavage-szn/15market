/// <reference lib="WebWorker" />
/**
 * 15MARKET Service Worker — PWA offline pre-cache only.
 * Phone notifications are handled by OneSignal's own worker
 * (public/push/onesignal/OneSignalSDKWorker.js), registered at the sub-scope
 * /push/onesignal/ so it does not conflict with this root-scope cache worker.
 */
import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});