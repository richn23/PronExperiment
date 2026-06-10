/* tasks/task3-pairs.js — Task 3: Minimal pairs listening (perception only)
 *
 * 8 items, one per contrast (8 contrasts in data/minimal_pairs.json).
 * Pure listening task — no microphone, no recording.
 *
 * Per-item flow:
 *   • Carrier sentence shown with target word blanked: "I noticed the ___…"
 *   • Audio plays automatically (listen 1).
 *   • Replay button available once (2 listens max).
 *   • Two large word-choice buttons (randomly ordered left/right).
 *   • Tap → green flash (correct) or red flash (wrong), blank fills.
 *   • ~1s pause, auto-advance to next item.
 *
 * Result shape per item (no wavBlob / pendingAzure — pure tap data):
 *   { pair_id, contrast, variant, correctWord, chosenWord, correct, listensUsed }
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

  function blankCarrier(carrier) {
    return Utils.escapeHtml(carrier).replace(/_{2,}/, '<span class="blank">______</span>');
  }

  function filledCarrier(carrier, word, status) {
    const cls = status === "correct" ? "filled-correct"
              : status === "wrong"   ? "filled-wrong"
              : "filled-neutral";
    return Utils.escapeHtml(carrier).replace(
      /_{2,}/,
      `<span class="${cls}">${Utils.escapeHtml(word)}</span>`
    );
  }

  function runTask3(root, session, onComplete) {
    let disposed = false;
    let interTimer = 0;
    let revealTimer = 0;
    let currentAudio = null;

    const audioCache = new Map();

    const items = selectItems(session.data.pairs, session.seed);
    session.task3.selected = items;
    session.task3.results = [];

    const state = {
      stage: "intro",
      idx: 0,
      listensUsed: 0,
      answered: false,
      orderLeftRight: null,
    };

    function clearTimers() {
      if (interTimer)  { clearTimeout(interTimer);  interTimer  = 0; }
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
    }

    function stopAudio() {
      if (currentAudio) {
        try { currentAudio.pause(); } catch (_) {}
        try { currentAudio.src = ""; } catch (_) {}
        currentAudio = null;
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
      disposeCache();
    }

    // -------------------------------------------------------------------------
    // Audio
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
          throw new Error(`Couldn't load or synthesize audio for ${item.pair.id}: ${err.message}`);
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
          <h2>Listen carefully</h2>
          <p class="lede">You'll hear a sentence. Tap the word you heard.</p>
        </header>
        <div class="spacer"></div>
        <button class="btn" id="start">Start</button>
      `;
      root.querySelector("#start").addEventListener("click", () => beginItem());
    }

    // -------------------------------------------------------------------------
    // Item
    // -------------------------------------------------------------------------

    function beginItem() {
      state.stage = "item";
      state.listensUsed = 0;
      state.answered = false;
      state.orderLeftRight = Math.random() < 0.5 ? ["a", "b"] : ["b", "a"];

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
          renderItem();
        })
        .catch((err) => {
          if (disposed) return;
          console.error("Audio load failed:", err);
          // Record a null result and skip
          session.task3.results.push({
            pair_id: item.pair.id,
            contrast: item.pair.contrast,
            variant: item.variant,
            correctWord: item.variant === "a" ? item.pair.word_a : item.pair.word_b,
            chosenWord: null,
            correct: null,
            listensUsed: 0,
            audioError: err.message,
          });
          advance();
        });
    }

    function renderItem() {
      const item = items[state.idx];
      const [leftKey, rightKey] = state.orderLeftRight;
      const leftWord  = leftKey  === "a" ? item.pair.word_a : item.pair.word_b;
      const rightWord = rightKey === "a" ? item.pair.word_a : item.pair.word_b;

      root.innerHTML = `
        ${Utils.buildProgressDots(items.length, state.idx + 1)}
        <div class="stack center">
          <h2 style="text-align:center">Which word did you hear?</h2>
          <div class="carrier-display" id="carrier">${blankCarrier(item.pair.carrier)}</div>
        </div>
        <div class="stack center" style="margin-top:16px;">
          <button class="btn" id="playBtn" type="button">▶ Tap to hear</button>
        </div>
        <div class="row" id="choices" style="visibility:hidden; pointer-events:none;">
          <button class="btn btn-secondary choice" data-key="${leftKey}">${Utils.escapeHtml(leftWord)}</button>
          <button class="btn btn-secondary choice" data-key="${rightKey}">${Utils.escapeHtml(rightWord)}</button>
        </div>
        <div class="row">
          <button class="btn-ghost" id="replay" type="button" style="visibility:hidden;">↻ Replay</button>
        </div>
      `;

      const playBtn     = root.querySelector("#playBtn");
      const replayBtn   = root.querySelector("#replay");
      const choicesEl   = root.querySelector("#choices");
      const choiceBtns  = root.querySelectorAll(".choice");
      const carrierEl   = root.querySelector("#carrier");

      function showChoices() {
        choicesEl.style.visibility = "";
        choicesEl.style.pointerEvents = "";
        replayBtn.style.visibility = "";
      }

      function refreshReplay() {
        replayBtn.disabled = state.listensUsed >= 2;
        replayBtn.style.opacity = state.listensUsed >= 2 ? "0.4" : "";
      }

      playBtn.addEventListener("click", () => {
        playBtn.disabled = true;
        playBtn.textContent = "▶ Playing…";
        playAudio(item).then(() => {
          playBtn.style.display = "none";
          showChoices();
          refreshReplay();
        });
      });

      replayBtn.addEventListener("click", () => {
        if (state.listensUsed >= 2 || state.answered) return;
        playAudio(item).then(refreshReplay);
        refreshReplay();
      });

      choiceBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          if (state.answered) return;
          state.answered = true;

          const key = btn.dataset.key;
          const correctKey = item.variant;
          const isCorrect = key === correctKey;

          const chosenWord  = key === "a" ? item.pair.word_a : item.pair.word_b;
          const correctWord = correctKey === "a" ? item.pair.word_a : item.pair.word_b;

          carrierEl.innerHTML = filledCarrier(
            item.pair.carrier,
            chosenWord,
            isCorrect ? "correct" : "wrong"
          );

          choiceBtns.forEach((b) => { b.disabled = true; });
          btn.classList.add(isCorrect ? "choice-correct" : "choice-wrong");

          if (!isCorrect) {
            choiceBtns.forEach((b) => {
              if (b.dataset.key === correctKey) b.classList.add("choice-correct");
            });
          }

          session.task3.results.push({
            pair_id: item.pair.id,
            contrast: item.pair.contrast,
            variant: item.variant,
            correctWord,
            chosenWord,
            correct: isCorrect,
            listensUsed: state.listensUsed,
          });

          revealTimer = setTimeout(() => {
            revealTimer = 0;
            if (!disposed) advance();
          }, 1100);
        });
      });
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
          renderTransition();
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
          <h2>Good.</h2>
          <p class="muted">Now you'll listen and repeat.</p>
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
      if (state.stage === "intro") renderIntro();
    }

    render();
    return dispose;
  }

  global.Task3 = { run: runTask3, selectItems };
})(window);
