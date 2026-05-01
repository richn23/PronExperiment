/* tasks/task1-words.js — Task 1: Read aloud (words)
 *
 * Flow:
 *   intro → practice ("cat", not scored) → 3-2-1 countdown → 15 scored words → done
 *
 * Selection (deterministic via session.seed):
 *   - Exclude w_003 ("cat" — used as the practice word)
 *   - 11 words with syllables ≤ 2  (~70%)
 *   - 4 words with syllables ≥ 3   (~30%)
 *   - Shuffle, then ensure no two consecutive words share target_sound
 *
 * Per-word recording window:
 *   1 syllable  → 3000 ms
 *   2 syllables → 4000 ms
 *   3+ syllable → 5000 ms
 *
 * Hint:
 *   Tap "? Hint" → reveals IPA + stress chart inline. Auto-closes after 5 s.
 *   hinted=true is stored on the result.
 */

(function (global) {
  function selectWords(allWords, seed) {
    const rng = Utils.seededRandom(seed);
    const eligible = allWords.filter((w) => w.id !== "w_003");
    const short = eligible.filter((w) => w.syllables <= 2);
    const long = eligible.filter((w) => w.syllables >= 3);

    const shortPick = Utils.shuffle(short, rng).slice(0, 11);
    const longPick = Utils.shuffle(long, rng).slice(0, 4);

    const combined = Utils.shuffle([...shortPick, ...longPick], rng);

    // Avoid two consecutive items sharing target_sound. Greedy: when a clash
    // is found, swap with the next eligible item further down the line.
    for (let i = 1; i < combined.length; i++) {
      if (combined[i].target_sound !== combined[i - 1].target_sound) continue;
      for (let j = i + 1; j < combined.length; j++) {
        const breaksAt_j = combined[j].target_sound === combined[i - 1].target_sound;
        const breaksNext = (j + 1 < combined.length) &&
          combined[j + 1].target_sound === combined[i].target_sound;
        if (!breaksAt_j && !breaksNext) {
          const tmp = combined[i]; combined[i] = combined[j]; combined[j] = tmp;
          break;
        }
      }
    }
    return combined;
  }

  function getMaxRecordMs(syllables) {
    if (syllables <= 1) return 3000;
    if (syllables === 2) return 4000;
    return 5000;
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderHintReveal(word) {
    const sylls = Utils.ipaSyllables(word.ipa);
    const stress = word.stress_pattern || [];
    const cells = sylls.map((s, i) => {
      const cls = "stress-bar s" + (stress[i] === undefined ? 0 : stress[i]);
      return `<div class="syllable">
                <div class="ipa-syl">${Utils.escapeHtml(s)}</div>
                <div class="${cls}"></div>
              </div>`;
    }).join("");
    return `<div class="hint-reveal" role="note">
              <div class="ipa-line">${Utils.escapeHtml(Utils.stripIpaSlashes(word.ipa))}</div>
              <div class="syllable-row">${cells}</div>
            </div>`;
  }

  // ---------------------------------------------------------------------------
  // Main runner
  // ---------------------------------------------------------------------------

  function runTask1(root, session, onComplete) {
    let disposed = false;
    let recCtrl = null;
    let hintTimer = 0;
    let interWordTimer = 0;
    let countdownTimer = 0;

    const practice = session.data.words.find((w) => w.id === "w_003");
    const selected = selectWords(session.data.words, session.seed);
    session.task1.practice = practice;
    session.task1.selected = selected;
    session.task1.results = [];
    session.task1.hintLog = [];

    const hintsUsed = {}; // word_id -> true

    const state = {
      stage: "intro", // intro | practice | countdown | words | transition
      idx: 0,
      hintOpen: false,
    };

    function clearTimers() {
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
      if (interWordTimer) { clearTimeout(interWordTimer); interWordTimer = 0; }
      if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = 0; }
    }

    function stopRecording() {
      if (recCtrl) {
        try { recCtrl.stop(); } catch (_) {}
        recCtrl = null;
      }
    }

    function dispose() {
      disposed = true;
      clearTimers();
      stopRecording();
    }

    // -------------------------------------------------------------------------
    // Intro
    // -------------------------------------------------------------------------

    function renderIntro() {
      root.innerHTML = `
        <header class="stack-tight">
          <h2>Read aloud</h2>
          <p class="lede">You'll see one word at a time. Say each word clearly.</p>
          <p class="muted">Tap <strong>Hint</strong> if you're not sure how to say a word.</p>
        </header>
        <div class="spacer"></div>
        <button class="btn" id="start">Start</button>
      `;
      root.querySelector("#start").addEventListener("click", () => {
        state.stage = "practice";
        render();
      });
    }

    // -------------------------------------------------------------------------
    // Practice
    // -------------------------------------------------------------------------

    function renderPractice() {
      renderWordScreen(practice, /* isPractice */ true, /* totalDots */ 1, /* doneDots */ 0);
    }

    // -------------------------------------------------------------------------
    // Countdown 3-2-1
    // -------------------------------------------------------------------------

    function renderCountdown() {
      let n = 3;
      function tick() {
        if (disposed) return;
        if (n === 0) {
          state.stage = "words";
          state.idx = 0;
          render();
          return;
        }
        root.innerHTML = `
          <div class="stack center" style="margin:auto">
            <p class="muted">Ready…</p>
            <div class="countdown-number">${n}</div>
          </div>
        `;
        n--;
        countdownTimer = setTimeout(tick, 700);
      }
      tick();
    }

    // -------------------------------------------------------------------------
    // Word screen (used by both practice + scored)
    // -------------------------------------------------------------------------

    function renderWordScreen(word, isPractice, totalDots, doneDots) {
      const maxMs = getMaxRecordMs(word.syllables);
      root.innerHTML = `
        ${isPractice
          ? `<div class="practice-banner">Practice — this one doesn't count.</div>`
          : Utils.buildProgressDots(totalDots, doneDots)}
        <div class="word-stage stack center">
          <div class="word-display">${Utils.escapeHtml(word.word)}</div>
          <button class="hint-button" id="hintBtn" type="button">? Hint</button>
          <div id="hintArea" class="hint-area"></div>
        </div>
        <div class="rec-zone">
          <div class="rec-indicator"><span class="pulse"></span>Recording</div>
          <div class="countdown-bar"><div class="fill" id="countdown"></div></div>
        </div>
      `;

      // Hint
      const hintBtn = root.querySelector("#hintBtn");
      const hintArea = root.querySelector("#hintArea");

      hintBtn.addEventListener("click", () => {
        if (state.hintOpen) return; // already open
        if (!isPractice) hintsUsed[word.id] = true;
        state.hintOpen = true;
        hintArea.innerHTML = renderHintReveal(word);
        hintBtn.classList.add("hidden");
        if (hintTimer) clearTimeout(hintTimer);
        hintTimer = setTimeout(() => {
          if (disposed) return;
          state.hintOpen = false;
          hintArea.innerHTML = "";
          hintBtn.classList.remove("hidden");
          hintTimer = 0;
        }, 5000);
      });

      // Recording
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
        console.error("Failed to start recording:", err);
        finishWordWithoutScore(word, isPractice);
        return;
      }

      recCtrl.done
        .then((result) => {
          recCtrl = null;
          if (disposed) return;
          if (!isPractice) {
            // Prosody assessment is disabled for Task 1: isolated single words
            // have no rhythm to assess, so Azure returns ProsodyScore=0, which
            // deflates word-level AccuracyScore (e.g. "necessary" coming back
            // as 62 even though phonemes averaged 86). With prosody off, the
            // word-level number tracks the phoneme mean as Azure documents.
            // Tasks 2/3/4 keep prosody enabled — they're sentence-level.
            const pendingAzure = AzureSpeech.scorePronunciation(
              result.wavBlob,
              word.word,
              { enableProsody: false }
            ).catch((err) => ({ error: true, message: err && err.message || String(err) }));

            session.task1.results.push({
              word_id: word.id,
              word: word.word,
              target_sound: word.target_sound,
              syllables: word.syllables,
              stress_pattern: word.stress_pattern,
              hinted: !!hintsUsed[word.id],
              durationMs: result.durationMs,
              wavBlob: result.wavBlob,
              pendingAzure,
            });

            if (hintsUsed[word.id]) {
              session.task1.hintLog.push({ word_id: word.id, hinted: true });
            }
          }
          advanceFromWord(isPractice);
        })
        .catch((err) => {
          recCtrl = null;
          if (disposed) return;
          console.warn("Recording resolved with error:", err);
          advanceFromWord(isPractice);
        });
    }

    function finishWordWithoutScore(word, isPractice) {
      if (!isPractice) {
        session.task1.results.push({
          word_id: word.id,
          word: word.word,
          target_sound: word.target_sound,
          syllables: word.syllables,
          stress_pattern: word.stress_pattern,
          hinted: !!hintsUsed[word.id],
          durationMs: 0,
          wavBlob: null,
          pendingAzure: Promise.resolve({ error: true, message: "Recording unavailable" }),
        });
      }
      advanceFromWord(isPractice);
    }

    function advanceFromWord(isPractice) {
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
      state.hintOpen = false;

      // Brief pause so the user perceives the transition.
      interWordTimer = setTimeout(() => {
        interWordTimer = 0;
        if (disposed) return;
        if (isPractice) {
          state.stage = "countdown";
          render();
          return;
        }
        state.idx++;
        if (state.idx >= selected.length) {
          state.stage = "transition";
          render();
          return;
        }
        render();
      }, 250);
    }

    // -------------------------------------------------------------------------
    // Transition
    // -------------------------------------------------------------------------

    function renderTransition() {
      root.innerHTML = `
        <div class="stack center" style="margin:auto">
          <h2>Great.</h2>
          <p class="muted">Now let's try some sentences.</p>
        </div>
      `;
      countdownTimer = setTimeout(() => {
        countdownTimer = 0;
        if (!disposed) onComplete();
      }, 1400);
    }

    // -------------------------------------------------------------------------
    // Dispatch
    // -------------------------------------------------------------------------

    function render() {
      // Note: in normal flow, recCtrl is always null on entry — recordings
      // resolve before state transitions. stopRecording() is reserved for
      // dispose() so we don't race with a resolving done promise.
      clearTimers();
      switch (state.stage) {
        case "intro": return renderIntro();
        case "practice": return renderPractice();
        case "countdown": return renderCountdown();
        case "words": return renderWordScreen(
          selected[state.idx], false, selected.length, state.idx + 1);
        case "transition": return renderTransition();
      }
    }

    render();
    return dispose;
  }

  global.Task1 = { run: runTask1, selectWords };
})(window);
