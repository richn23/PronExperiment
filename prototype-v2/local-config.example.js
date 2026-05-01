/* local-config.example.js — TEMPLATE. Copy this file to `local-config.js`
 * (which is gitignored) and paste your Azure Speech credentials in.
 *
 * The real local-config.js is loaded by index.html *before* azure-speech.js so
 * the wrappers can read window.AZE_CONFIG at module-evaluation time.
 *
 * Get a key:
 *   1. Azure portal → create a "Speech" resource (free F0 tier is fine)
 *   2. Resource → Keys and Endpoint → copy KEY 1 and the region
 */

window.AZE_CONFIG = {
  AZURE_KEY: "",
  AZURE_REGION: "",
  // Optional overrides — leave commented unless you know you want different
  // values. Defaults are en-GB / en-GB-RyanNeural in azure-speech.js.
  // AZURE_LOCALE: "en-GB",
  // AZURE_TTS_VOICE: "en-GB-SoniaNeural",
};
