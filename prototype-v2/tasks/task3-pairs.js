/* tasks/task3-pairs.js — Task 3: Listen, identify and repeat
 *
 * 8 items, one per contrast (8 contrasts in data/minimal_pairs.json):
 *   IH/IY, TH/S, DH/D, L/R, V/W, AE/EH, CH/SH, B/V
 *
 * Per-item structure (two rounds, max 2 listens total across both):
 *   Round 1 — Listen + identify
 *     • Audio plays once on entry (listen 1).
 *     • Carrier shown with target word blanked: "I noticed the ___ ..."
 *     • Two choice buttons (left/right random) + optional Replay (consumes listen 2).
 *     • Tap a choice → green/red flash, blank fills with chosen word, ~1 s pause.
 *   Round 2 — Listen + repeat
 *     • Correct word fills the blank.
 *     • Audio plays again only if listens remaining; otherwise skipped.
 *     • Record button → up to 8 s → Stop or auto-stop.
 *     • Azure PA called with referenceText = full carrier (correct word filled in).
 *
 * Audio source for the carrier: tries pre-generated MP3 at audio/<id>_<variant>.mp3
 * first, then falls back to runtime Azure TTS. Stage 5's generate_audio.html
 * page batches all 48 files (24 pairs × 2 variants) once per voice change.
 *
 * Diagnostic: each result captures both round1_correct (perception) and the
 * Round 2 PA score (production), per the brief.
 */

(function (global) {
  function selectItems(pairs, seed) {
    const rng = Utils.seededRandom(seed + 2); // distinct seed slot from Tasks 1, 2

    // Group by contrast. Order contrasts by first appearance for determinism.
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

  function blankCarrier(carrier) {
    return Utils.escapeHtml(carrier).replace(/_{2,}/, '<span class="blank">______</span>');
  }

  function filledCarrier(carrier, word, status) {
    // status: "correct" | "wrong" | "neutral"
    const cls = status === "correct" ? "filled-correct"
              : status === "wrong" ? "filled-wrong"
              : "filled-neutral";
    return Utils.escapeHtml(carrier).replace(
      /_{2,}/,
      `<span class="${cls}">${Utils.escapeHtml(word)}</span>`
    );
  }

  function runTask3(root, session, onComplete) {
    let disposed = false;
    let recCtrl = null;
    let interTimer = 0;
    let revealTimer = 0;
    let currentAudio = null;

    // Cache: Map<"id-variant", { blob, url }>
    const audioCache = new Map();

    const items = selectItems(session.data.pairs, session.seed);
    session.task3.selected = items;
    session.task3.results = [];

    const state = {
      stage: "intro", // intro | item | transition
      idx: 0,
      round: 1,
      listensUsed: 0,
      userChoice: null,    // 'a' | 'b'
      round1Correct: null, // bool
      orderLeftRight: null, // ['a','b'] or ['b','a']
    };

    function clearTimers() {
      if (interTimer) { clearTimeout(interTimer); interTimer = 0; }
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
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

      // Try pre-generated file
      try {
        const r = await fetch(filePath, { cache: "default" });
        if (r.ok) {
          blob = await r.blob();
        }
      } catch (_) { /* fall through */ }

      // Fall back to runtime TTS
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
        a.onended = () => {
          if (currentAudio === a) currentAudio = null;
          resolve();
        };
        a.onerror = () => {
          if (currentAudio === a) currentAudio = null;
          resolve();
        };
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
          <p class="lede">You'll hear a sentence. Choose the word you heard, then repeat the sentence.</p>
        </header>
        <div class="spacer"></div>
        <button class="btn" id="start">Start</button>
      `;
      root.querySelector("#start").addEventListener("click", () => {
        beginItem();
      });
    }

    // -------------------------------------------------------------------------
    // Begin a new item — load audio, then render Round 1
    // -------------------------------------------------------------------------

    function beginItem() {
      state.stage = "item";
      state.round = 1;
      state.listensUsed = 0;
      state.userChoice = null;
      state.round1Correct = null;
      // Random L/R order for the two choice buttons
      const order = Math.random() < 0.5 ? ["a", "b"] : ["b", "a"];
      state.orderLeftRight = order;

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
          renderRound1();
        })
        .catch((err) => {
          if (disposed) return;
          console.error("Audio load failed:", err);
          // Skip this item, record an error result, advance
          session.task3.results.push({
            pair_id: item.pair.id,
            contrast: item.pair.contrast,
            variant: item.variant,
            heardWord: item.variant === "a" ? item.pair.word_a : item.pair.word_b,
            round1_correct: null,
            durationMs: 0,
            wavBlob: null,
            pendingAzure: Promise.resolve({ error: true, message: err.message }),
            audioError: err.message,
          });
          advance();
        });
    }

    // -------------------------------------------------------------------------
    // Round 1 — Listen + identify
    // -------------------------------------------------------------------------

    function renderRound1() {
      const item = items[state.idx];
      const [leftKey, rightKey] = state.orderLeftRight;
      const leftWord = leftKey === "a" ? item.pair.word_a : item.pair.word_b;
      const rightWord = rightKey === "a" ? item.pair.word_a : item.pair.word_b;

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center">
          <h2 style="text-align:center">Listen carefully</h2>
          <div class="carrier-display" id="carrier">${blankCarrier(item.pair.carrier)}</div>
        </div>
        <div class="row" id="choices">
          <button class="btn btn-secondary choice" data-key="${leftKey}">${Utils.escapeHtml(leftWord)}</button>
          <button class="btn btn-secondary choice" data-key="${rightKey}">${Utils.escapeHtml(rightWord)}</button>
        </div>
        <div class="row">
          <button class="btn-ghost" id="replay" type="button">↻ Replay</button>
        </div>
      `;

      const replayBtn = root.querySelector("#replay");
      const choiceBtns = root.querySelectorAll(".choice");
      const carrierEl = root.querySelector("#carrier");

      function refreshControls() {
        replayBtn.disabled = state.listensUsed >= 2;
        replayBtn.style.opacity = state.listensUsed >= 2 ? "0.4" : "";
      }

      replayBtn.addEventListener("click", () => {
        if (state.listensUsed >= 2) return;
        playAudio(item).then(refreshControls);
        refreshControls();
      });

      choiceBtns.forEach((b) => {
        b.addEventListener("click", () => {
          if (state.userChoice) return; // already answered
          const key = b.dataset.key;
          state.userChoice = key;
          state.round1Correct = key === item.variant;
          const chosenWord = key === "a" ? item.pair.word_a : item.pair.word_b;

          carrierEl.innerHTML = filledCarrier(
            item.pair.carrier,
            chosenWord,
            state.round1Correct ? "correct" : "wrong"
          );

          choiceBtns.forEach((x) => { x.disabled = true; });
          b.classList.add(state.round1Correct ? "choice-correct" : "choice-wrong");

          revealTimer = setTimeout(() => {
            revealTimer = 0;
            if (disposed) return;
            state.round = 2;
            renderRound2();
          }, 1100);
        });
      });

      // Auto-play on entry (listen 1)
      playAudio(item).then(refreshControls);
      refreshControls();
    }

    // -------------------------------------------------------------------------
    // Round 2 — Listen + repeat
    // -------------------------------------------------------------------------

    function renderRound2() {
      const item = items[state.idx];
      const correctWord = item.variant === "a" ? item.pair.word_a : item.pair.word_b;

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center">
          <h2 style="text-align:center">Now repeat the full sentence clearly</h2>
          <div class="carrier-display">${filledCarrier(item.pair.carrier, correctWord, "neutral")}</div>
        </div>
        <div class="row">
          <button class="btn-ghost" id="replay2" type="button">↻ Replay</button>
        </div>
        <div class="spacer"></div>
        <button class="btn" id="record">Start recording</button>
      `;

      const replayBtn = root.querySelector("#replay2");
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
        startRound2Recording(item, correctWord);
      });

      // Auto-play on entry, only if a listen is left
      if (state.listensUsed < 2) {
        playAudio(item).then(refreshReplay);
      }
      refreshReplay();
    }

    function startRound2Recording(item, correctWord) {
      const maxMs = 8000;
      const reference = fillCarrier(item.pair.carrier, correctWord);

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center">
          <div class="carrier-display">${filledCarrier(item.pair.carrier, correctWord, "neutral")}</div>
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
        finishRound2(item, reference, null);
        return;
      }

      root.querySelector("#stop").addEventListener("click", () => {
        if (recCtrl) recCtrl.stop();
      });

      recCtrl.done
        .then((result) => {
          recCtrl = null;
          if (disposed) return;
          finishRound2(item, reference, result);
        })
        .catch((err) => {
          recCtrl = null;
          if (disposed) return;
          console.warn("Task 3 recording resolved with error:", err);
          finishRound2(item, reference, null);
        });
    }

    function finishRound2(item, reference, result) {
      const wavBlob = result ? result.wavBlob : null;
      const durationMs = result ? result.durationMs : 0;

      const pendingAzure = wavBlob
        ? AzureSpeech.scorePronunciation(wavBlob, reference)
            .catch((err) => ({ error: true, message: err && err.message || String(err) }))
        : Promise.resolve({ error: true, message: "Recording unavailable" });

      const correctWord = item.variant === "a" ? item.pair.word_a : item.pair.word_b;
      const targetPhoneme = item.variant === "a" ? item.pair.phoneme_a : item.pair.phoneme_b;

      session.task3.results.push({
        pair_id: item.pair.id,
        contrast: item.pair.contrast,
        variant: item.variant,
        heardWord: correctWord,
        targetPhoneme,
        round1_correct: state.round1Correct,
        listensUsed: state.listensUsed,
        reference,
        durationMs,
        wavBlob,
        pendingAzure,
      });

      advance();
    }

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
        case "item": return /* handled by beginItem/renderRound* */ null;
        case "transition": return renderTransition();
      }
    }

    render();
    return dispose;
  }

  global.Task3 = { run: runTask3, selectItems };
})(window);
