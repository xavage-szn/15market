console.log("=== DIAGNOSTIC TEST ===");
console.log("1. React loaded:", typeof React !== 'undefined');
console.log("2. ReactDOM loaded:", typeof ReactDOM !== 'undefined');
console.log("3. Window global:", typeof window.global !== 'undefined');
console.log("4. Buffer:", typeof window.Buffer !== 'undefined');
console.log("5. Process:", typeof window.process !== 'undefined');

// Test if main.jsx can be imported
import('./src/main.jsx')
    .then(() => console.log("✅ main.jsx imported successfully"))
    .catch(err => console.error("❌ main.jsx import failed:", err.message, err.stack));
