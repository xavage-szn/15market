import { Buffer } from 'buffer';

// Initialize browser polyfills before loading wallet and blockchain SDKs.
// Safari can throw "Cannot access uninitialized variable" when these SDKs
// inspect globals during module initialization.
if (typeof globalThis !== 'undefined') {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  if (typeof window !== 'undefined' && !window.global) {
    window.global = window;
  }
}

// Load the application only after the globals above have been initialized.
import('./main.jsx');
