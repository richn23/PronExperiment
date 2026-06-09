/* tasks/task5-free.js — Task 5: Free production (questions + image)
 *
 * 3 prompts per session: 2 random questions + 1 random image.
 *
 * Per prompt:
 *   • Show prompt (text or image)
 *   • Tap "Start recording" → record up to 18 s → Stop or auto-stop
 *   • Two-step Azure: STT first → use transcript as referenceText → PA on same audio
 *   • If transcript is empty / very low confidence: flag and skip scoring.
 */

(function (global) {
  const QUESTION_PROMPTS = [
    { id: "q_001", text: "What did you do yesterday?" },
    { id: "q_002", text: "Do you prefer studying in the morning or evening? Why?" },
    { id: "q_003", text: "Describe the room you are in right now." },
    { id: "q_004", text: "Tell me about your favourite meal." },
  ];

  const IMAGE_PROMPTS = [
    { id: "i_001", topic: "people in a park",       url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800" },
    { id: "i_002", topic: "kitchen scene cooking",  url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800" },
    { id: "i_003", topic: "street market",          url: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800" },
    { id: "i_004", topic: "office with desks",      url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800" },
  ];

  const MAX_MS = 18000;
  const MIN_TRANSCRIPT_WORDS = 3;
  const MIN_CONFIDENCE = 0.3;

  function selectPrompts(seed) {
    const rng = Utils.seededRandom(seed + 4); // distinct seed slot
    const questions = Utils.pickN(QUESTION_PROMPTS, 2, rng);
    const image = Utils.pickOne(IMAGE_PROMPTS, rng);
    return [
      { kind: "question", ...questions[0] },
      { kind: "question", ...questions[1] },
      { kind: "image",    ...image },
    ];
  }

  function runTask5(root, session, onComplete) {
    let disposed = false;
    let recCtrl = null;
    let interTimer = 0;

    const prompts = selectPrompts(session.seed);
    session.task5.selected = prompts;
    session.task5.results = [];

    const state = { stage: "intro", idx: 0, sub: "ready" };

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
          <h2>Speak freely</h2>
          <p class="lede">You'll answer two short questions and describe a picture. Speak in full sentences.</p>
        </header>
        <div class="spacer"></div>
        <button class="btn" id="start">Start</button>
      `;
      root.querySelector("#start").addEventListener("click", () => {
        state.stage = "items";
        state.idx = 0;
        state.sub = "ready";
        render();
      });
    }

    // -------------------------------------------------------------------------
    // Per-prompt screen
    // -------------------------------------------------------------------------

    function renderItem(prompt) {
      if (state.sub === "ready") return renderReady(prompt);
      return renderRecording(prompt);
    }

    function renderReady(prompt) {
      const body = prompt.kind === "image"
        ? `<img class="prompt-image" src="${Utils.escapeHtml(prompt.url)}" alt="Image prompt: ${Utils.escapeHtml(prompt.topic)}" />
           <div class="lede center">Describe what you can see in this picture.</div>`
        : `<div class="prompt-question">${Utils.escapeHtml(prompt.text)}</div>`;

      root.innerHTML = `
        ${Utils.buildProgressDots(prompts.length, state.idx + 1)}
        <div class="prompt-stage stack center">
          ${body}
        </div>
        <div class="spacer"></div>
        <button class="btn" id="start">Start recording</button>
      `;

      root.querySelector("#start").addEventListener("click", () => {
        state.sub = "recording";
        render();
      });
    }

    function renderRecording(prompt) {
      const body = prompt.kind === "image"
        ? `<img class="prompt-image" src="${Utils.escapeHtml(prompt.url)}" alt="" />
           <div class="muted center">Describe what you can see in this picture.</div>`
        : `<div class="prompt-question">${Utils.escapeHtml(prompt.text)}</div>`;

      root.innerHTML = `
        ${Utils.buildProgressDots(prompts.length, state.idx + 1)}
        <div class="prompt-stage stack center">
          ${body}
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
          maxMs: MAX_MS,
          onTick: (ms) => {
            const remaining = Math.max(0, 1 - ms / MAX_MS);
            countdownEl.style.transform = `scaleX(${remaining})`;
          },
        });
      } catch (err) {
        console.error("Failed to start Task 5 recording:", err);
        finishItem(prompt, null);
        return;
      }

      root.querySelector("#stop").addEventListener("click", () => {
        if (recCtrl) recCtrl.stop();
      });

      recCtrl.done
        .then((result) => {
          recCtrl = null;
          if (disposed) return;
          finishItem(prompt, result);
        })
        .catch((err) => {
          recCtrl = null;
          if (disposed) return;
          console.warn("Task 5 recording resolved with error:", err);
          finishItem(prompt, null);
        });
    }

    // STT → PA chain
    function chainSttThenPa(wavBlob) {
      return AzureSpeech.transcribe(wavBlob)
        .then((stt) => {
          const transcript = (stt.text || "").trim();
          const conf = stt.confidence;
          const wordCount = transcript ? transcript.split(/\s+/).length : 0;
          const lowConfidence =
            !transcript ||
            wordCount < MIN_TRANSCRIPT_WORDS ||
            (typeof conf === "number" && conf < MIN_CONFIDENCE);

          if (lowConfidence) {
            return { transcript, confidence: conf, lowConfidence: true, paResult: null };
          }

          return AzureSpeech.scorePronunciation(wavBlob, transcript)
            .then((paResult) => ({ transcript, confidence: conf, lowConfidence: false, paResult }))
            .catch((err) => ({
              transcript, confidence: conf, lowConfidence: false, paResult: null,
              paError: err && err.message || String(err),
            }));
        })
        .catch((err) => ({ error: true, message: err && err.message || String(err) }));
    }

    function finishItem(prompt, result) {
      const wavBlob = result ? result.wavBlob : null;
      const durationMs = result ? result.durationMs : 0;

      const pendingAzure = wavBlob
        ? chainSttThenPa(wavBlob)
        : Promise.resolve({ error: true, message: "Recording unavailable" });

      session.task5.results.push({
        prompt_id: prompt.id,
        prompt_kind: prompt.kind,
        prompt_text: prompt.text || prompt.topic,
        prompt_url: prompt.url || null,
        durationMs,
        wavBlob,
        pendingAzure,
      });

      interTimer = setTimeout(() => {
        interTimer = 0;
        if (disposed) return;
        state.idx++;
        if (state.idx >= prompts.length) {
          state.stage = "done";
          render();
          return;
        }
        state.sub = "ready";
        render();
      }, 350);
    }

    // -------------------------------------------------------------------------
    // Done
    // -------------------------------------------------------------------------

    function renderDone() {
      root.innerHTML = `
        <div class="stack center" style="margin:auto">
          <h2>All done.</h2>
          <p class="muted">Analysing your pronunciation…</p>
        </div>
      `;
      interTimer = setTimeout(() => {
        interTimer = 0;
        if (!disposed) onComplete();
      }, 800);
    }

    // -------------------------------------------------------------------------
    // Dispatch
    // -------------------------------------------------------------------------

    function render() {
      clearTimers();
      switch (state.stage) {
        case "intro": return renderIntro();
        case "items": return renderItem(prompts[state.idx]);
        case "done":  return renderDone();
      }
    }

    render();
    return dispose;
  }

  global.Task5 = { run: runTask5, selectPrompts };
})(window);
