/* app.js — state machine, data loading, screen registry
 *
 * Stage 1 implements:
 *   - Data loading at boot
 *   - SCREENS registry + go(id) navigation with cleanup
 *   - WELCOME screen
 *   - MIC_CHECK screen (animated waveform + VAD auto-advance)
 *   - Stub screens for everything else so the flow is walkable end-to-end
 *
 * Stages 2–5 will replace the stubs with real implementations.
 */

// =============================================================================
// Session state
// =============================================================================

const SESSION = {
  startedAt: null,
  finishedAt: null,
  seed: Date.now(), // overrideable via ?seed=... for reproducible runs
  data: { words: null, sentences: null, pairs: null, tips: null },
  micStream: null,
  task1: { practice: null, selected: [], results: [], hintLog: [] },
  task2: { selected: [], results: [] },
  task3: { selected: [], results: [] },
  task4: { selected: [], results: [] },
  scores: null,
};

// Allow ?seed=12345 in the URL for deterministic test runs.
(function () {
  const m = window.location.search.match(/[?&]seed=(\d+)/);
  if (m) SESSION.seed = Number(m[1]);
})();

// =============================================================================
// Screen registry + navigation
// =============================================================================

const SCREENS = {};
let _disposeCurrent = null;

function registerScreen(id, fn) {
  SCREENS[id] = fn;
}

function go(id) {
  if (typeof _disposeCurrent === "function") {
    try { _disposeCurrent(); } catch (e) { console.warn("screen dispose error", e); }
  }
  _disposeCurrent = null;

  const root = document.getElementById("screen");
  root.innerHTML = "";
  const fn = SCREENS[id];
  if (!fn) {
    root.innerHTML = `<div class="banner banner-error">Unknown screen: ${id}</div>`;
    return;
  }
  const dispose = fn(root, go);
  if (typeof dispose === "function") _disposeCurrent = dispose;
}

// =============================================================================
// Data loading
// =============================================================================

async function loadJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load ${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadAllData() {
  const [words, sentences, pairs, tips] = await Promise.all([
    loadJSON("data/word_bank.json"),
    loadJSON("data/sentence_bank.json"),
    loadJSON("data/minimal_pairs.json"),
    loadJSON("data/phoneme_tips.json"),
  ]);
  SESSION.data = { words, sentences, pairs, tips };
}

// =============================================================================
// S0 — Welcome
// =============================================================================

registerScreen("WELCOME", (root, next) => {
  root.innerHTML = `
    <header class="stack-tight">
      <h1>Pronunciation Check</h1>
      <p class="lede">We'll listen to how you speak and give you a personalised report. Takes about 8 minutes.</p>
    </header>

    <div class="card stack">
      <p class="muted" style="color:var(--text)">You'll need:</p>
      <ul class="muted" style="margin:0; padding-left:20px; line-height:1.7">
        <li>A quiet room</li>
        <li>Microphone permission (we'll ask next)</li>
        <li>About 8 minutes</li>
      </ul>
    </div>

    <div class="spacer"></div>
    <button class="btn" id="start">Start</button>
    <button class="btn-ghost center" id="debug" style="align-self:center">Audio debug \u2192</button>
  `;
  root.querySelector("#start").addEventListener("click", () => {
    SESSION.startedAt = Date.now();
    next("MIC_CHECK");
  });
  root.querySelector("#debug").addEventListener("click", () => next("DEBUG_AUDIO"));
});

// =============================================================================
// S1 — Mic check (animated waveform + voice-activity detection)
// =============================================================================

registerScreen("MIC_CHECK", (root, next) => {
  root.innerHTML = `
    <header class="stack-tight center">
      <h2>Microphone check</h2>
      <p class="muted">Say something so we can hear you.</p>
    </header>

    <canvas class="mic-canvas" id="micCanvas" aria-hidden="true"></canvas>

    <div class="mic-status" id="micStatus">
      <span class="dot"></span>
      <span class="label">Listening…</span>
    </div>

    <div class="spacer"></div>
    <button class="btn" id="continue" disabled>Sounds good — continue</button>
  `;

  const canvas = root.querySelector("#micCanvas");
  const statusEl = root.querySelector("#micStatus");
  const continueBtn = root.querySelector("#continue");

  let analyser = null;
  let rafId = 0;
  let stopped = false;
  let detected = false;
  let speechMs = 0;
  let lastT = performance.now();
  let advanceTimer = 0;

  // Voice-activity detection thresholds
  const RMS_THRESHOLD = 0.04;
  const REQUIRED_MS = 1000;
  const AUTO_ADVANCE_DELAY_MS = 800;

  function showError(message, allowRetry = true) {
    root.innerHTML = `
      <header class="stack-tight center">
        <h2>Microphone check</h2>
      </header>
      <div class="banner banner-error">${message}</div>
      ${allowRetry ? '<button class="btn" id="retry">Try again</button>' : ""}
    `;
    if (allowRetry) {
      root.querySelector("#retry").addEventListener("click", () => next("MIC_CHECK"));
    }
  }

  function setupCanvas() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  // Read theme accent from CSS so styles.css stays the single source of truth.
  const accent = (getComputedStyle(document.documentElement)
    .getPropertyValue("--accent") || "#2563eb").trim();

  function withAlpha(color, a) {
    if (color.startsWith("#")) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return color; // rgb()/rgba()/named — fall back to whatever was given
  }

  function drawBars(bins) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barCount = 28;
    const gap = Math.max(2, Math.floor(w / barCount / 6));
    const barW = (w - gap * (barCount - 1)) / barCount;
    const baseY = h * 0.5;
    const usable = bins.length - 4; // skip the very lowest bin (DC-ish)

    for (let i = 0; i < barCount; i++) {
      const idx = 4 + Math.floor((i / barCount) * usable);
      const v = bins[idx] / 255;
      const barH = Math.max(2, v * h * 0.85);
      const x = i * (barW + gap);
      const y = baseY - barH / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, withAlpha(accent, 0.95));
      grad.addColorStop(1, withAlpha(accent, 0.55));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW, barH);
    }
  }

  function tick() {
    if (stopped || !analyser) return;

    analyser.analyser.getByteFrequencyData(analyser.freqBins);
    analyser.analyser.getByteTimeDomainData(analyser.timeBins);
    drawBars(analyser.freqBins);

    const rms = AudioUtils.rmsFromTimeDomain(analyser.timeBins);
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;

    if (rms > RMS_THRESHOLD) {
      speechMs += dt;
    } else {
      // Decay so brief pauses don't reset progress, but silence eventually does.
      speechMs = Math.max(0, speechMs - dt * 0.5);
    }

    if (!detected && speechMs >= REQUIRED_MS) {
      detected = true;
      statusEl.classList.add("detected");
      statusEl.querySelector(".label").textContent = "Microphone is working";
      continueBtn.disabled = false;
      advanceTimer = window.setTimeout(() => {
        if (!stopped) next("T1_INTRO");
      }, AUTO_ADVANCE_DELAY_MS);
    }

    rafId = requestAnimationFrame(tick);
  }

  continueBtn.addEventListener("click", () => {
    if (continueBtn.disabled) return;
    next("T1_INTRO");
  });

  (async function start() {
    try {
      const stream = await AudioUtils.ensureLiveStream(SESSION.micStream);
      SESSION.micStream = stream;
      analyser = AudioUtils.createAnalyser(stream);
      setupCanvas();
      window.addEventListener("resize", setupCanvas);
      lastT = performance.now();
      tick();
    } catch (err) {
      console.error(err);
      const msg =
        err && err.name === "NotAllowedError"
          ? "We need microphone permission to run the test. Please allow access and try again."
          : `Couldn't access the microphone: ${err && err.message ? err.message : err}`;
      showError(msg);
    }
  })();

  // Cleanup on screen change
  return function dispose() {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (advanceTimer) clearTimeout(advanceTimer);
    window.removeEventListener("resize", setupCanvas);
    if (analyser) analyser.dispose();
    // Note: we keep SESSION.micStream alive so the tasks can reuse the
    // already-granted permission. If you want to release it instead, call
    // AudioUtils.stopStream(SESSION.micStream); SESSION.micStream = null;
  };
});

// =============================================================================
// DEBUG_AUDIO — record-and-playback test screen
//
// Three states inside this single screen:
//   idle        → big "Start recording" button
//   recording   → live level meter + elapsed timer + stop button
//   done        → stats + playback + download + record-again
// =============================================================================

registerScreen("DEBUG_AUDIO", (root, next) => {
  let disposed = false;
  let rec = null;
  let lastUrl = null;

  const MAX_OPTIONS = [3, 5, 8, 12]; // seconds
  let maxSec = 5;

  function release() {
    if (rec) { try { rec.stop(); } catch (_) {} rec = null; }
    revokeUrl();
  }

  function revokeUrl() {
    if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
  }

  function renderIdle(stream) {
    if (disposed) return;
    revokeUrl();
    root.innerHTML = `
      <header class="stack-tight">
        <h2>Audio debug</h2>
        <p class="muted">Record a clip and play it back. Verifies the full capture \u2192 16 kHz mono WAV pipeline.</p>
      </header>

      <div class="card stack">
        <p class="muted" style="color:var(--text)">Max recording length</p>
        <div class="row" id="maxOpts" role="radiogroup" aria-label="Max recording length"></div>
      </div>

      <button class="btn" id="record">Start recording</button>
      <button class="btn-ghost center" id="back" style="align-self:center">\u2190 Back to welcome</button>
    `;

    const opts = root.querySelector("#maxOpts");
    MAX_OPTIONS.forEach((s) => {
      const b = document.createElement("button");
      b.className = "btn btn-secondary";
      b.style.flex = "1 1 0";
      b.style.minWidth = "0";
      b.textContent = `${s}s`;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(s === maxSec));
      if (s === maxSec) b.style.outline = "2px solid var(--accent)";
      b.addEventListener("click", () => { maxSec = s; renderIdle(stream); });
      opts.appendChild(b);
    });

    root.querySelector("#record").addEventListener("click", () => {
      renderRecording(stream);
    });
    root.querySelector("#back").addEventListener("click", () => next("WELCOME"));
  }

  function renderRecording(stream) {
    if (disposed) return;
    root.innerHTML = `
      <header class="stack-tight">
        <h2>Recording\u2026</h2>
        <p class="muted">Speak now. Auto-stops at ${maxSec}s.</p>
      </header>

      <div class="card stack">
        <div class="row" style="justify-content:space-between">
          <span class="rec-indicator"><span class="pulse"></span>Recording</span>
          <span id="elapsed" style="font-variant-numeric:tabular-nums; font-weight:600">0.0s</span>
        </div>
        <div class="level-meter" id="meter"><div class="fill"></div></div>
        <div class="countdown-bar"><div class="fill" id="countdown"></div></div>
      </div>

      <div class="spacer"></div>
      <button class="btn btn-danger" id="stop">Stop</button>
    `;

    const meterFill = root.querySelector("#meter > .fill");
    const meterEl = root.querySelector("#meter");
    const elapsedEl = root.querySelector("#elapsed");
    const countdownEl = root.querySelector("#countdown");

    rec = AudioUtils.startRecording(stream, {
      maxMs: maxSec * 1000,
      onLevel: (rms) => {
        // sqrt curve calibrated so 0.08 RMS \u2248 50%, 0.32 RMS \u2248 100%.
        // Gives proper headroom above comfortable speech instead of pegging.
        const pct = Math.min(100, Math.sqrt(rms) * 177);
        meterFill.style.width = `${pct}%`;
        meterEl.classList.toggle("peaking", rms > 0.15);
      },
      onTick: (ms) => {
        elapsedEl.textContent = `${(ms / 1000).toFixed(1)}s`;
        const remainingPct = Math.max(0, 1 - ms / (maxSec * 1000));
        countdownEl.style.transform = `scaleX(${remainingPct})`;
      },
    });

    root.querySelector("#stop").addEventListener("click", () => rec && rec.stop());

    rec.done
      .then((result) => {
        rec = null;
        if (disposed) return;
        renderDone(stream, result);
      })
      .catch((err) => {
        rec = null;
        if (disposed) return;
        renderError(stream, err);
      });
  }

  function renderDone(stream, result) {
    if (disposed) return;
    revokeUrl();
    lastUrl = URL.createObjectURL(result.wavBlob);
    const sizeKb = (result.wavBlob.size / 1024).toFixed(1);
    const durSec = (result.durationMs / 1000).toFixed(2);
    const peakPct = (result.peak * 100).toFixed(0);

    root.innerHTML = `
      <header class="stack-tight">
        <h2>Recording captured</h2>
        <p class="muted">WAV ready for Azure Pronunciation Assessment.</p>
      </header>

      <div class="card stack">
        <div class="stats">
          <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">${durSec}s</div></div>
          <div class="stat"><div class="stat-label">Size</div><div class="stat-value">${sizeKb} KB</div></div>
          <div class="stat"><div class="stat-label">Sample rate</div><div class="stat-value">${result.sampleRate} Hz</div></div>
          <div class="stat"><div class="stat-label">Channels</div><div class="stat-value">${result.channels}</div></div>
          <div class="stat"><div class="stat-label">Peak level</div><div class="stat-value">${peakPct}%</div></div>
          <div class="stat"><div class="stat-label">Format</div><div class="stat-value" style="font-size:13px">16-bit PCM WAV</div></div>
        </div>
        <audio controls src="${lastUrl}"></audio>
      </div>

      <a class="btn btn-secondary" id="download" href="${lastUrl}" download="aze-debug-${Date.now()}.wav">Download WAV</a>
      <button class="btn" id="again">Record again</button>
      <button class="btn-ghost center" id="back" style="align-self:center">\u2190 Back to welcome</button>
    `;

    root.querySelector("#again").addEventListener("click", () => renderIdle(stream));
    root.querySelector("#back").addEventListener("click", () => next("WELCOME"));
  }

  function renderError(stream, err) {
    console.error("Recording failed:", err);
    root.innerHTML = `
      <header class="stack-tight"><h2>Recording failed</h2></header>
      <div class="banner banner-error">${(err && err.message) || err}</div>
      <button class="btn" id="again">Try again</button>
      <button class="btn-ghost center" id="back" style="align-self:center">\u2190 Back to welcome</button>
    `;
    root.querySelector("#again").addEventListener("click", () => renderIdle(stream));
    root.querySelector("#back").addEventListener("click", () => next("WELCOME"));
  }

  // Bootstrap: ensure we have a mic stream, then show idle.
  (async function bootstrap() {
    root.innerHTML = `<div class="stack center" style="margin:auto"><p class="muted">Requesting microphone\u2026</p></div>`;
    try {
      SESSION.micStream = await AudioUtils.ensureLiveStream(SESSION.micStream);
      if (disposed) return;
      renderIdle(SESSION.micStream);
    } catch (err) {
      if (disposed) return;
      renderError(null, err);
    }
  })();

  return function dispose() {
    disposed = true;
    release();
  };
});

// =============================================================================
// Tasks 1–4 — each task module owns its internal state machine.
// The screen registration is a thin wrapper that hands the root + a "complete"
// callback to the task runner and returns its dispose fn.
// =============================================================================

registerScreen("T1_INTRO", (root, next) => Task1.run(root, SESSION, () => next("T2_INTRO")));
registerScreen("T2_INTRO", (root, next) => Task2.run(root, SESSION, () => next("T3_INTRO")));
registerScreen("T3_INTRO", (root, next) => Task3.run(root, SESSION, () => next("T4_INTRO")));
registerScreen("T4_INTRO", (root, next) => Task4.run(root, SESSION, () => next("ANALYSING")));

registerScreen("ANALYSING", (root, next) => {
  root.innerHTML = `
    <div class="stack center" style="margin:auto">
      <h2>Analysing your pronunciation…</h2>
      <p class="muted" id="analyseMsg">Listening to your sounds…</p>
    </div>
  `;
  const messages = [
    "Listening to your sounds…",
    "Checking your stress patterns…",
    "Building your report…",
  ];
  let i = 0;
  const msgEl = root.querySelector("#analyseMsg");
  const interval = setInterval(() => {
    i = (i + 1) % messages.length;
    msgEl.textContent = messages[i];
  }, 1200);

  // Resolve every pending Azure promise into result.azure on the session record.
  // Each pendingAzure is wrapped in .catch in the task modules, so this never rejects.
  const allTasks = [SESSION.task1, SESSION.task2, SESSION.task3, SESSION.task4];
  const allPromises = [];
  for (const t of allTasks) {
    if (!t || !t.results) continue;
    for (const r of t.results) {
      if (r.pendingAzure) {
        allPromises.push(
          r.pendingAzure.then((res) => {
            r.azure = res;
            delete r.pendingAzure;
          })
        );
      }
    }
  }

  let canceled = false;
  // Minimum dwell of 800 ms so the UI doesn't flash if Azure is fast.
  Promise.all([Promise.all(allPromises), Utils.sleep(800)])
    .then(() => {
      if (canceled) return;
      clearInterval(interval);
      SESSION.finishedAt = Date.now();
      next("RESULTS");
    });

  return () => { canceled = true; clearInterval(interval); };
});

// RESULTS screen is rendered by results.js. We pass a wrapped `next` that
// fully resets the session before returning to WELCOME, otherwise a second
// run-through would inherit the previous session's data.
registerScreen("RESULTS", (root, next) => {
  return Results.render(root, SESSION, (target) => {
    if (target === "WELCOME") {
      if (SESSION.micStream) AudioUtils.stopStream(SESSION.micStream);
      SESSION.micStream = null;
      SESSION.startedAt = null;
      SESSION.finishedAt = null;
      SESSION.scores = null;
      SESSION.task1 = { practice: null, selected: [], results: [], hintLog: [] };
      SESSION.task2 = { selected: [], results: [] };
      SESSION.task3 = { selected: [], results: [] };
      SESSION.task4 = { selected: [], results: [] };
    }
    next(target || "WELCOME");
  });
});

// =============================================================================
// Boot
// =============================================================================

window.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("screen");
  root.innerHTML = `<div class="stack center" style="margin:auto"><p class="muted">Loading…</p></div>`;
  try {
    await loadAllData();
    const startScreen = window.location.hash === "#debug" ? "DEBUG_AUDIO" : "WELCOME";
    go(startScreen);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="banner banner-error">Failed to load data files: ${err.message}<br>Make sure you're running this through a local web server (e.g. <code>python -m http.server</code>) and not opening the file directly.</div>`;
  }
});
