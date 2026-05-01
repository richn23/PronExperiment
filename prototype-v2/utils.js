/* utils.js — small shared helpers used across tasks
 *
 * Public API (window.Utils):
 *   seededRandom(seed)          → fn() returning float in [0,1)  (mulberry32)
 *   shuffle(arr, rng)           → new array, Fisher-Yates with given rng
 *   pickN(arr, n, rng)          → first n of shuffled copy
 *   pickOne(arr, rng)           → single random element
 *   escapeHtml(str)             → HTML-safe string
 *   stripIpaSlashes(ipa)        → "/ʃɪp/" → "ʃɪp"
 *   ipaSyllables(ipa)           → ["ˈfəʊ", "tə", "ɡrɑːf"]
 *   buildProgressDots(n, doneCount) → HTML string
 *   downloadBlob(blob, filename) → triggers browser download
 *   createObjectUrl(blob)       → URL.createObjectURL with auto-revoke helper
 *   sleep(ms)                   → Promise<void>
 */

(function (global) {
  // Mulberry32 — small, fast, well-distributed. Good enough for selection seeds.
  function seededRandom(seed) {
    let s = (seed | 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickN(arr, n, rng) {
    return shuffle(arr, rng).slice(0, n);
  }

  function pickOne(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  function stripIpaSlashes(ipa) {
    return String(ipa || "").replace(/^\//, "").replace(/\/$/, "");
  }

  // The IPA strings in word_bank.json use "." as syllable separators.
  // E.g. "/ˈfəʊ.tə.ɡrɑːf/" → ["ˈfəʊ", "tə", "ɡrɑːf"]
  function ipaSyllables(ipa) {
    return stripIpaSlashes(ipa).split(".").filter(Boolean);
  }

  function buildProgressDots(total, doneCount) {
    const items = [];
    for (let i = 0; i < total; i++) {
      const cls = i < doneCount ? "dot done" : "dot";
      items.push(`<span class="${cls}"></span>`);
    }
    return `<div class="progress-dots" aria-label="Progress: ${doneCount} of ${total}">${items.join("")}</div>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Small URL-lifecycle helper. Returns { url, revoke } — caller revokes when done.
  function createObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    return {
      url,
      revoke() { try { URL.revokeObjectURL(url); } catch (_) {} },
    };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  global.Utils = {
    seededRandom,
    shuffle,
    pickN,
    pickOne,
    escapeHtml,
    stripIpaSlashes,
    ipaSyllables,
    buildProgressDots,
    downloadBlob,
    createObjectUrl,
    sleep,
  };
})(window);
