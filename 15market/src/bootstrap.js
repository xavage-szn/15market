// Initialize browser polyfills before loading wallet and blockchain SDKs.
// Safari can throw "Cannot access uninitialized variable" when these SDKs
// inspect globals during module initialization.
//
// The polyfill is applied best-effort inside a try/catch. This file is the
// HTML entry point, so a static import failure here (for example a stale
// service worker serving a build where the 'buffer' specifier was not
// resolved) would abort the module graph and leave a blank page with no way
// to recover. Buffer is also injected by vite-plugin-node-polyfills for
// bundled modules, so losing it here must not be fatal.
try {
  const { Buffer } = await import('buffer');
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.Buffer) globalThis.Buffer = Buffer;
    if (typeof window !== 'undefined' && !window.global) {
      window.global = window;
    }
  }
} catch (e) {
  console.warn('[bootstrap] Buffer polyfill unavailable, continuing:', e?.message);
}

// Load the application only after the globals above have been initialized.
await import('./main.jsx');
