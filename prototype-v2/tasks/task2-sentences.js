/* tasks/task2-sentences.js — Task 2: Read aloud (utterances → sentences → groups)
 *
 * Selection (deterministic via session.seed):
 *   2 utterances, 2 sentences, 2 sentence_groups — uniform random within type.
 *   Order is FIXED: utterances → sentences → sentence_groups (progressive difficulty).
 *
 * Per-item recording max:
 *   utterance       → 6 s
 *   sentence        → 10 s
 *   sentence_group  → 18 s
 *
 * Screen states per item:
 *   reading      → sentence shown + "Ready to record" button
 *   recording    → sentence shown + countdown + Stop button
 *   advancing    → 250 ms transition pause, no UI flash
 */

(function (global) {
  function selectItems(allItems, seed) {
    const rng = Utils.seededRandom(seed + 1); // distinct seed slot from Task 1
    const utterances = allItems.filter((i) => i.item_type === "utterance");
    const sentences = allItems.filter((i) => i.item_type === "sentence");
    const groups = allItems.filter((i) => i.item_type === "sentence_group");
    return [
      ...Utils.pickN(utterances, 2, rng),
      ...Utils.pickN(sentences, 2, rng),
      ...Utils.pickN(groups, 2, rng),
    ];
  }

  function getMaxRecordMs(itemType) {
    if (itemType === "utterance") return 6000;
    if (itemType === "sentence") return 10000;
    return 18000; // sentence_group
  }

  function runTask2(root, session, onComplete) {
    let disposed = false;
    let recCtrl = null;
    let interTimer = 0;

    const selected = selectItems(session.data.sentences, session.seed);
    session.task2.selected = selected;
    session.task2.results = [];

    const state = { stage: "intro", idx: 0, sub: "reading" };

    function clearTimers() {
      if (interTimer) { clearTimeout(interTimer); interTimer = 0; }
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
          <p class="lede">You'll see a sentence. Read it silently first, then tap <strong>Ready</strong> and read it aloud.</p>
        </header>
        <div class="spacer"></div>
        <button class="btn" id="start">Start</button>
      `;
      root.querySelector("#start").addEventListener("click", () => {
        state.stage = "items";
        state.idx = 0;
        state.sub = "reading";
        render();
      });
    }

    // -------------------------------------------------------------------------
    // Item screen — two sub-states (reading / recording)
    // -------------------------------------------------------------------------

    function renderItem(item) {
      if (state.sub === "reading") return renderReading(item);
      return renderRecording(item);
    }

    function renderReading(item) {
      root.innerHTML = `
        ${Utils.buildProgressDots(selected.length, state.idx + 1)}
        <div class="sentence-stage stack center">
          <div class="sentence-display">${Utils.escapeHtml(item.text)}</div>
          <div class="muted center">Read it silently. Tap when you're ready.</div>
        </div>
        <div class="spacer"></div>
        <button class="btn" id="ready">Ready to record</button>
      `;
      root.querySelector("#ready").addEventListener("click", () => {
        state.sub = "recording";
        render();
      });
    }

    function renderRecording(item) {
      const maxMs = getMaxRecordMs(item.item_type);
      root.innerHTML = `
        ${Utils.buildProgressDots(selected.length, state.idx + 1)}
        <div class="sentence-stage stack center">
          <div class="sentence-display">${Utils.escapeHtml(item.text)}</div>
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
        console.error("Failed to start Task 2 recording:", err);
        finishItem(item, null);
        return;
      }

      root.querySelector("#stop").addEventListener("click", () => {
        if (recCtrl) recCtrl.stop();
      });

      recCtrl.done
        .then((result) => {
          recCtrl = null;
          if (disposed) return;
          finishItem(item, result);
        })
        .catch((err) => {
          recCtrl = null;
          if (disposed) return;
          console.warn("Task 2 recording resolved with error:", err);
          finishItem(item, null);
        });
    }

    function finishItem(item, result) {
      const wavBlob = result ? result.wavBlob : null;
      const durationMs = result ? result.durationMs : 0;

      const pendingAzure = wavBlob
        ? AzureSpeech.scorePronunciation(wavBlob, item.text)
            .catch((err) => ({ error: true, message: err && err.message || String(err) }))
        : Promise.resolve({ error: true, message: "Recording unavailable" });

      session.task2.results.push({
        item_id: item.id,
        item_type: item.item_type,
        text: item.text,
        target_phonemes: item.target_phonemes || [],
        durationMs,
        wavBlob,
        pendingAzure,
      });

      // Brief pause then advance
      interTimer = setTimeout(() => {
        interTimer = 0;
        if (disposed) return;
        state.idx++;
        if (state.idx >= selected.length) {
          state.stage = "transition";
          render();
          return;
        }
        state.sub = "reading";
        render();
      }, 250);
    }

    // -------------------------------------------------------------------------
    // Transition
    // -------------------------------------------------------------------------

    function renderTransition() {
      root.innerHTML = `
        <div class="stack center" style="margin:auto">
          <h2>Nice.</h2>
          <p class="muted">Next, you'll listen and repeat.</p>
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
        case "items": return renderItem(selected[state.idx]);
        case "transition": return renderTransition();
      }
    }

    render();
    return dispose;
  }

  global.Task2 = { run: runTask2, selectItems };
})(window);
