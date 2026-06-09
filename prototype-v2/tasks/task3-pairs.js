/* tasks/task3-pairs.js — Task 3: Listen and repeat
 *
 * 8 items, one per contrast (8 contrasts in data/minimal_pairs.json):
 *   IH/IY, TH/S, DH/D, L/R, V/W, AE/EH, CH/SH, B/V
 *
 * Per-item structure:
 *   • Audio plays automatically on entry (listen 1).
 *   • Replay button available once (listen 2 max total).
 *   • Sentence text is NEVER shown — student repeats from memory/ear only.
 *   • Record button → up to 8 s → Stop or auto-stop.
 *   • Azure PA called with referenceText = full carrier (correct word filled in).
 *
 * Audio source for the carrier: tries pre-generated MP3 at audio/<id>_<variant>.mp3
 * first, then falls back to runtime Azure TTS.
 */

(function (global) {
  function selectItems(pairs, seed) {
    const rng = Utils.seededRandom(seed + 2);

    const byContrast = new Map();
    for (const p of pairs) {
      if (!byContrast.has(p.contrast)) byContrast.set(p.contrast, []);
      byContrast.get(p.contrast).push(p);
    }

    const out = [];
    for (const list of byContrast.values()) {
      const pick = Utils.pickOne(list, rng);
      const variant = rng() < 0.5 ? "a" : "b";
      out.push({ pair: pick, variant });
    }
    return Utils.shuffle(out, rng);
  }

  function fillCarrier(carrier, word) {
    return carrier.replace(/_{2,}/, word);
  }

  function runTask3(root, session, onComplete) {
    let disposed = false;
    let recCtrl = null;
    let interTimer = 0;
    let currentAudio = null;

    const audioCache = new Map();

    const items = selectItems(session.data.pairs, session.seed);
    session.task3.selected = items;
    session.task3.results = [];

    const state = {
      stage: "intro",
      idx: 0,
      listensUsed: 0,
    };

    function clearTimers() {
      if (interTimer) { clearTimeout(interTimer); interTimer = 0; }
    }

    function stopAudio() {
      if (currentAudio) {
        try { currentAudio.pause(); } catch (_) {}
        try { currentAudio.src = ""; } catch (_) {}
        currentAudio = null;
      }
    }

    function stopRecording() {
      if (recCtrl) {
        try { recCtrl.stop(); } catch (_) {}
        recCtrl = null;
      }
    }

    function disposeCache() {
      for (const v of audioCache.values()) {
        try { URL.revokeObjectURL(v.url); } catch (_) {}
      }
      audioCache.clear();
    }

    function dispose() {
      disposed = true;
      clearTimers();
      stopAudio();
      stopRecording();
      disposeCache();
    }

    // -------------------------------------------------------------------------
    // Audio loading: pre-generated MP3 → runtime TTS fallback
    // -------------------------------------------------------------------------

    async function loadAudio(item) {
      const key = `${item.pair.id}-${item.variant}`;
      if (audioCache.has(key)) return audioCache.get(key);

      const word = item.variant === "a" ? item.pair.word_a : item.pair.word_b;
      const text = fillCarrier(item.pair.carrier, word);
      const filePath = `audio/${item.pair.id}_${item.variant}.mp3`;

      let blob = null;

      try {
        const r = await fetch(filePath, { cache: "default" });
        if (r.ok) blob = await r.blob();
      } catch (_) {}

      if (!blob) {
        try {
          blob = await AzureSpeech.synthesizeToBlob(text);
        } catch (err) {
          throw new Error(
            `Couldn't load or synthesize audio for ${item.pair.id} (${item.variant}): ${err.message}`
          );
        }
      }

      const url = URL.createObjectURL(blob);
      const entry = { blob, url };
      audioCache.set(key, entry);
      return entry;
    }

    function playAudio(item) {
      stopAudio();
      const cached = audioCache.get(`${item.pair.id}-${item.variant}`);
      if (!cached) return Promise.resolve();
      const a = new Audio(cached.url);
      currentAudio = a;
      state.listensUsed++;
      return new Promise((resolve) => {
        a.onended = () => { if (currentAudio === a) currentAudio = null; resolve(); };
        a.onerror = () => { if (currentAudio === a) currentAudio = null; resolve(); };
        a.play().catch(() => resolve());
      });
    }

    // -------------------------------------------------------------------------
    // Intro
    // -------------------------------------------------------------------------

    function renderIntro() {
      root.innerHTML = `
        <header class="stack-tight">
          <h2>Listen and repeat</h2>
          <p class="lede">You'll hear a sentence. Listen carefully, then repeat it out loud.</p>
        </header>
        <div class="spacer"></div>
        <button class="btn" id="start">Start</button>
      `;
      root.querySelector("#start").addEventListener("click", () => {
        beginItem();
      });
    }

    // -------------------------------------------------------------------------
    // Begin a new item — load audio, then render the listen screen
    // -------------------------------------------------------------------------

    function beginItem() {
      state.stage = "item";
      state.listensUsed = 0;

      const item = items[state.idx];

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center" style="margin:auto">
          <p class="muted">Loading audio…</p>
        </div>
      `;

      loadAudio(item)
        .then(() => {
          if (disposed) return;
          renderListenAndRepeat();
        })
        .catch((err) => {
          if (disposed) return;
          console.error("Audio load failed:", err);
          session.task3.results.push({
            pair_id: item.pair.id,
            contrast: item.pair.contrast,
            variant: item.variant,
            heardWord: item.variant === "a" ? item.pair.word_a : item.pair.word_b,
            listensUsed: 0,
            durationMs: 0,
            wavBlob: null,
            pendingAzure: Promise.resolve({ error: true, message: err.message }),
            audioError: err.message,
          });
          advance();
        });
    }

    // -------------------------------------------------------------------------
    // Listen screen — sentence text is never shown
    // -------------------------------------------------------------------------

    function renderListenAndRepeat() {
      const item = items[state.idx];

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center" style="margin:auto">
          <h2 style="text-align:center">Listen carefully</h2>
          <p class="muted" style="text-align:center">Then repeat what you heard.</p>
        </div>
        <div class="row">
          <button class="btn-ghost" id="replay" type="button">↻ Replay</button>
        </div>
        <div class="spacer"></div>
        <button class="btn" id="record">Start recording</button>
      `;

      const replayBtn = root.querySelector("#replay");
      const recordBtn = root.querySelector("#record");

      function refreshReplay() {
        replayBtn.disabled = state.listensUsed >= 2;
        replayBtn.style.opacity = state.listensUsed >= 2 ? "0.4" : "";
      }

      replayBtn.addEventListener("click", () => {
        if (state.listensUsed >= 2) return;
        playAudio(item).then(refreshReplay);
        refreshReplay();
      });

      recordBtn.addEventListener("click", () => {
        startRecording(item);
      });

      // Auto-play on entry
      playAudio(item).then(refreshReplay);
      refreshReplay();
    }

    // -------------------------------------------------------------------------
    // Recording — no sentence text visible
    // -------------------------------------------------------------------------

    function startRecording(item) {
      const maxMs = 8000;
      const correctWord = item.variant === "a" ? item.pair.word_a : item.pair.word_b;
      const reference = fillCarrier(item.pair.carrier, correctWord);

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center" style="margin:auto">
          <p class="muted">Repeat what you heard.</p>
        </div>
        <div class="rec-zone">
          <div class="rec-indicator"><span class="pulse"></span>Recording</div>
          <div class="countdown-bar"><div class="fill" id="countdown"></div></div>
        </div>
        <button class="btn btn-danger" id="stop">Stop</button>
      `;

      const countdownEl = root.querySelector("#countdown");
      const stream = session.micStream;

      try {
        recCtrl = AudioUtils.startRecording(stream, {
          maxMs,
          onTick: (ms) => {
            const remaining = Math.max(0, 1 - ms / maxMs);
            countdownEl.style.transform = `scaleX(${remaining})`;
          },
        });
      } catch (err) {
        console.error("Failed to start Task 3 recording:", err);
        finish(item, reference, null);
        return;
      }

      root.querySelector("#stop").addEventListener("click", () => {
        if (recCtrl) recCtrl.stop();
      });

      recCtrl.done
        .then((result) => {
          recCtrl = null;
          if (disposed) return;
          finish(item, reference, result);
        })
        .catch((err) => {
          recCtrl = null;
          if (disposed) return;
          console.warn("Task 3 recording error:", err);
          finish(item, reference, null);
        });
    }

    function finish(item, reference, result) {
      const wavBlob = result ? result.wavBlob : null;
      const durationMs = result ? result.durationMs : 0;

      const correctWord = item.variant === "a" ? item.pair.word_a : item.pair.word_b;
      const targetPhoneme = item.variant === "a" ? item.pair.phoneme_a : item.pair.phoneme_b;

      const pendingAzure = wavBlob
        ? AzureSpeech.scorePronunciation(wavBlob, reference)
            .catch((err) => ({ error: true, message: err && err.message || String(err) }))
        : Promise.resolve({ error: true, message: "Recording unavailable" });

      session.task3.results.push({
        pair_id: item.pair.id,
        contrast: item.pair.contrast,
        variant: item.variant,
        heardWord: correctWord,
        targetPhoneme,
        listensUsed: state.listensUsed,
        reference,
        durationMs,
        wavBlob,
        pendingAzure,
      });

      advance();
    }

    // -------------------------------------------------------------------------
    // Advance
    // -------------------------------------------------------------------------

    function advance() {
      stopAudio();
      interTimer = setTimeout(() => {
        interTimer = 0;
        if (disposed) return;
        state.idx++;
        if (state.idx >= items.length) {
          state.stage = "transition";
          render();
          return;
        }
        beginItem();
      }, 250);
    }

    // -------------------------------------------------------------------------
    // Transition
    // -------------------------------------------------------------------------

    function renderTransition() {
      root.innerHTML = `
        <div class="stack center" style="margin:auto">
          <h2>Almost done.</h2>
          <p class="muted">One more part.</p>
        </div>
      `;
      interTimer = setTimeout(() => {
        interTimer = 0;
        if (!disposed) onComplete();
      }, 1400);
    }

    // -------------------------------------------------------------------------
    // Dispatch
    // -------------------------------------------------------------------------

    function render() {
      clearTimers();
      switch (state.stage) {
        case "intro": return renderIntro();
        case "item": return null;
        case "transition": return renderTransition();
      }
    }

    render();
    return dispose;
  }

  global.Task3 = { run: runTask3, selectItems };
})(window);
