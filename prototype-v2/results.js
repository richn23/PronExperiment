/* results.js — renders the personalised report screen.
 *
 * Public API (window.Results):
 *   Results.render(root, session, next) → dispose function
 *
 * The report layout maps 1:1 to report_mockup.html:
 *   1. Hero (overall + band + summary + "i" → How modal)
 *   2. How you did in each part (4 section tiles)
 *   3. The five things we measure (dimension bars + per-dim "i" modals)
 *   4. Words you pronounced clearly (green chips)
 *   5. What to work on (phoneme groups + recordings + tips)
 *   6. How well you heard the differences (Task 3 round-1 table)
 *   7. Words vs sentences (compare block)
 *   8. Free speech (empty state OR per-item summaries)
 *
 * All scoring is delegated to scoring.js — this file is presentation only.
 * Modal copy is sourced verbatim from the mockup; please run wording changes
 * through Richard before editing.
 */

(function (global) {
  // =============================================================================
  // Per-dimension modal copy — verbatim from report_mockup.html.
  // =============================================================================

  const DIM_INFO = {
    phoneme: {
      title: "Phoneme accuracy",
      sub: "Weighted 25% of the overall score",
      what: "How accurately you produce each individual sound. A 'phoneme' is the smallest unit of sound in English — like /θ/ in 'think' or /ɪ/ in 'ship'. This is the most direct measure of pronunciation.",
      how: "Azure Speech AI returns an accuracy score (0–100) for every phoneme in every word you say. We average those scores across the whole session.",
      why: "Substituting one sound for another can change word meaning entirely or make the speaker hard to follow. Across a session, phoneme errors form a pattern that pinpoints exactly which sounds need work.",
    },
    fluency: {
      title: "Fluency",
      sub: "Weighted 22% of the overall score",
      what: "How natural and flowing your speech is — including pace, hesitation, and the length of uninterrupted speech. This is not about speed — it's about whether speech flows without excessive pausing.",
      how: "We use Azure's fluency score directly. It's calculated from sentence recordings (Task 2 and Task 4) and incorporates pause data, pace, and run length.",
      why: "Even accurate pronunciation becomes hard to follow if speech is heavily paused or broken into short chunks. Fluency reflects how the speech lands for a listener in real time.",
    },
    stress: {
      title: "Word stress",
      sub: "Weighted 18% of the overall score",
      what: "Whether you place stress on the correct syllable within each word — for example, PHO-to-graph rather than pho-TO-graph.",
      how: "We compare the actual duration of each syllable in your recording against the expected stress pattern stored in our word bank. The stressed syllable should be the longest. We also use Azure's pitch-variation signal to confirm natural intonation.",
      why: "Misplaced stress is one of the most common causes of miscommunication in English, even when individual sounds are correct. A listener may fail to recognise a word entirely if the stress is wrong.",
    },
    consistency: {
      title: "Consistency",
      sub: "Weighted 18% of the overall score",
      what: "How stable your pronunciation quality is across the session. Two learners can both score 80 overall — one through consistently good performance, one through a mix of strong and weak items.",
      how: "We calculate the standard deviation of accuracy scores across all items in the session. A small spread = high consistency. A large spread = low consistency.",
      why: "Listeners experience a steady speaker very differently to a speaker who swings between strong and weak. Consistency is particularly relevant for identifying learners who can produce sounds — but not yet reliably.",
    },
    sentenceStability: {
      title: "Sentence stability",
      sub: "Weighted 17% of the overall score",
      what: "Whether your pronunciation holds steady when words are combined into a full sentence, compared to your performance on single words. A high score means you don't lose accuracy under the cognitive load of a longer item.",
      how: "We compare your average accuracy on isolated words (Task 1) with your average accuracy on sentences (Task 2). If you perform equally well or better in sentences, this scores 100.",
      why: "A learner can produce individual words clearly in isolation but struggle when those words are stacked into a sentence. This dimension surfaces that breakdown.",
    },
  };

  // Short one-line note shown beneath each dimension bar (mockup wording).
  const DIM_NOTES = {
    phoneme: "How clearly you produce individual sounds.",
    fluency: "How smoothly your speech flows — pace and pauses.",
    stress: "Whether you stress the right syllable in each word.",
    consistency: "How steady your performance was across the session.",
    sentenceStability: "Whether your pronunciation holds steady from single words to full sentences.",
  };

  const DIM_ORDER = ["phoneme", "fluency", "stress", "consistency", "sentenceStability"];

  // =============================================================================
  // Small render helpers
  // =============================================================================

  const esc = (s) => Utils.escapeHtml(s == null ? "" : s);

  function fmt(score) {
    return typeof score === "number" ? String(score) : "—";
  }

  function barTone(score) {
    if (typeof score !== "number") return "na";
    if (score >= 85) return "high";
    if (score >= 65) return "mid";
    return "low";
  }

  // =============================================================================
  // Section 1 — Hero
  // =============================================================================

  function summaryNarrative(report) {
    const dims = report.dimensions;
    const overall = report.overall;
    const focus = report.focusAreas;

    const parts = [];

    if (report.sessionFlagged) {
      const u = report.unscoredTotal || 0;
      const t = report.itemsTotal || 0;
      return `Most of the recordings in this session had no clear speech detected (${u} of ${t} items unscored). The mic may have been muted or pointed away — try retaking the test in a quiet room with the mic close to you.`;
    }

    if (overall == null) {
      return "We didn't capture enough usable data this session to compute a score. Try again in a quiet room.";
    }

    if (overall >= 85) {
      parts.push("Your overall pronunciation is strong — listeners can follow you easily.");
    } else if (overall >= 70) {
      parts.push("Your overall pronunciation is generally clear, with a few patterns worth refining.");
    } else if (overall >= 55) {
      parts.push("Your pronunciation is comprehensible, but inconsistent — listeners can follow you but it takes some work.");
    } else if (overall >= 40) {
      parts.push("Listeners have to work to follow you. With targeted practice on specific sounds and rhythm, this lifts quickly.");
    } else {
      parts.push("Pronunciation is currently the main thing getting in the way of being understood. Targeted practice will lift this rapidly.");
    }

    if (dims.sentenceStability === 100 && typeof report.sectionScores.task2 === "number" &&
        typeof report.sectionScores.task1 === "number" &&
        report.sectionScores.task2 > report.sectionScores.task1 + 5) {
      parts.push("Your pronunciation holds up well from single words into full sentences.");
    } else if (typeof dims.sentenceStability === "number" && dims.sentenceStability < 70) {
      parts.push("Your pronunciation drops noticeably from single words to full sentences.");
    }

    if (typeof dims.consistency === "number" && dims.consistency < 60) {
      parts.push("Your scores varied a lot between items — consistency is the area to firm up.");
    }

    if (focus && focus.length) {
      const top = focus.slice(0, 2).map((g) => g.label).join(" and ");
      parts.push(`A few individual sounds are worth a second look, especially ${top}.`);
    }

    return parts.join(" ");
  }

  function renderHero(report) {
    if (report.sessionFlagged) {
      return `
        <div class="hero report-card flagged" style="background:#94a3b8;">
          <div class="label">
            Session not scored
            <button class="info-btn" data-modal="how" title="How is this score calculated?" type="button">i</button>
          </div>
          <div class="band" style="margin-top:6px; font-size:18px;">Recording issues — most items had no clear speech</div>
          <p class="summary">${esc(summaryNarrative(report))}</p>
        </div>
      `;
    }
    const score = fmt(report.overall);
    const cls = Scoring.scoreClass(report.overall);
    return `
      <div class="hero report-card" style="${cls === "score-na" ? "background:#94a3b8;" : ""}">
        <div class="label">
          Your Pronunciation Score
          <button class="info-btn" data-modal="how" title="How is this score calculated?" type="button">i</button>
        </div>
        <div class="score">${esc(score)}</div>
        <div class="band">${esc(report.band)}</div>
        <p class="summary">${esc(summaryNarrative(report))}</p>
      </div>
    `;
  }

  // =============================================================================
  // Section 2 — Per-section tiles
  // =============================================================================

  function tile(name, score, desc) {
    const cls = Scoring.scoreClass(score);
    const numHtml = `<div class="score-num ${cls}">${esc(fmt(score))}</div>`;
    return `
      <div class="section-tile">
        <div class="name">${esc(name)}</div>
        ${numHtml}
        <div class="desc">${esc(desc)}</div>
      </div>
    `;
  }

  // Flagged variant — used when too many items in this task had no clear
  // speech. We deliberately show no number, just an explanation, so the user
  // doesn't read a misleading partial score (e.g. averaging 2 noise-driven
  // false positives over 13 silent items).
  function tileFlagged(name, qf) {
    const total = qf.total || 0;
    const unscored = qf.unscored || 0;
    return `
      <div class="section-tile flagged">
        <div class="name">${esc(name)}</div>
        <div class="score-num score-na">—</div>
        <div class="desc"><strong>Couldn't score this section</strong> — ${unscored} of ${total} recordings had no clear speech detected. Please retake this part.</div>
      </div>
    `;
  }

  function tileSplit(name, heard, said, desc, saidFlagged) {
    const cH = Scoring.scoreClass(heard);
    const cS = Scoring.scoreClass(said);
    const saidValue = saidFlagged
      ? `<div class="val score-na" title="Recordings had no clear speech — couldn't score">—</div>`
      : `<div class="val ${cS}">${esc(fmt(said))}</div>`;
    const saidNote = saidFlagged
      ? `<div class="desc" style="margin-top:6px;"><strong>Said:</strong> couldn't score — recordings unclear.</div>`
      : "";
    return `
      <div class="section-tile">
        <div class="name">${esc(name)}</div>
        <div class="split-scores">
          <div class="col">
            <div class="lbl">Heard</div>
            <div class="val ${cH}">${esc(fmt(heard))}</div>
          </div>
          <div class="col">
            <div class="lbl">Said</div>
            ${saidValue}
          </div>
        </div>
        <div class="desc">${esc(desc)}</div>
        ${saidNote}
      </div>
    `;
  }

  function renderSections(report) {
    const c = report.counts;
    const sec = report.sectionScores;
    const qf = report.qualityFlags || {};

    const t1Desc = `${c.task1 || 0} word${c.task1 === 1 ? "" : "s"} read aloud`;
    const t2Desc = `${c.task2 || 0} sentence${c.task2 === 1 ? "" : "s"} and groups`;
    const t3Desc = `${report.perception.correct}/${report.perception.total} right · ${c.task3 || 0} repeats scored`;
    const t4Desc = sec.task4 == null
      ? (c.task4 ? "Not enough usable data" : "No data this session")
      : `${c.task4} prompt${c.task4 === 1 ? "" : "s"}`;

    const t1Tile = qf.task1 && qf.task1.flagged
      ? tileFlagged("Single words", qf.task1)
      : tile("Single words", sec.task1, t1Desc);
    const t2Tile = qf.task2 && qf.task2.flagged
      ? tileFlagged("Sentences", qf.task2)
      : tile("Sentences", sec.task2, t2Desc);
    const t3Tile = tileSplit(
      "Minimal pairs",
      sec.task3Heard,
      sec.task3Said,
      t3Desc,
      qf.task3 && qf.task3.flagged
    );
    const t4Tile = qf.task4 && qf.task4.flagged
      ? tileFlagged("Free speech", qf.task4)
      : tile("Free speech", sec.task4, t4Desc);

    return `
      <div class="report-card">
        <h2>How you did in each part</h2>
        <div class="sections">
          ${t1Tile}
          ${t2Tile}
          ${t3Tile}
          ${t4Tile}
        </div>
      </div>
    `;
  }

  // =============================================================================
  // Section 3 — Dimensions
  // =============================================================================

  function renderDimension(key, score) {
    const tone = barTone(score);
    const cls = Scoring.scoreClass(score);
    const width = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
    const note = DIM_NOTES[key];
    const title = DIM_INFO[key].title;
    return `
      <div class="dimension">
        <div class="dim-row">
          <span class="dim-name">${esc(title)}<button class="info-btn-sm" data-modal="dim" data-dim="${key}" title="${esc(title)} — more info" type="button">i</button></span>
          <span class="dim-score ${cls}">${esc(fmt(score))}</span>
        </div>
        <div class="dim-bar-bg"><div class="dim-bar ${tone}" style="width: ${width}%"></div></div>
        <div class="dim-note">${note}</div>
      </div>
    `;
  }

  function renderDimensions(report) {
    const dims = report.dimensions;
    return `
      <div class="report-card">
        <h2>The five things we measure</h2>
        ${DIM_ORDER.map((k) => renderDimension(k, dims[k])).join("")}
      </div>
    `;
  }

  // =============================================================================
  // Section 4 — Strengths
  // =============================================================================

  function renderStrengths(report) {
    if (!report.strengths || !report.strengths.length) {
      const t1Flagged = report.qualityFlags && report.qualityFlags.task1 && report.qualityFlags.task1.flagged;
      const lead = t1Flagged
        ? "Couldn't pick out clear-pronunciation words — most Task 1 recordings had no clear speech detected. Please retake this part."
        : "No words this session scored ≥85 across every sound. Don't worry — it's a high bar. Keep practising and try again.";
      return `
        <div class="report-card">
          <h2>Words you pronounced clearly</h2>
          <p class="lead">${esc(lead)}</p>
        </div>
      `;
    }

    const chips = report.strengths
      .map((w) => `<span class="word-chip">${esc(w.word)}</span>`)
      .join("");

    return `
      <div class="report-card">
        <h2>Words you pronounced clearly</h2>
        <p class="lead">These words came out perfectly — every sound was clear.</p>
        <div class="word-chips">${chips}</div>
      </div>
    `;
  }

  // =============================================================================
  // Section 5 — Focus areas (with per-item audio buttons)
  // =============================================================================

  function focusGroupHtml(group, recordingMap) {
    const tier = group.tier;
    const tierLabel = tier === "low" ? "low" : "mid";
    const tierClass = tier === "low" ? "score-low" : "score-mid";

    const headerLabel = group.example_word
      ? `${esc(group.label.includes("(") ? group.code : group.label)} — as in "${esc(group.example_word)}"`
      : esc(group.label);

    const recButtons = group.examples.map((ex, i) => {
      const id = `${group.code}-${i}-${ex.word_id || ex.word}`;
      const hasAudio = recordingMap.has(ex.word_id);
      const disabledAttr = hasAudio ? "" : "disabled";
      return `
        <button class="focus-rec" type="button" data-recording-key="${esc(ex.word_id || ex.word)}" ${disabledAttr}>
          <span class="play-icon"></span>
          <span class="word-label">${esc(ex.word)}</span>
          <span class="word-score">${esc(ex.score)}</span>
        </button>
      `;
    }).join("");

    const modelButton = group.example_word
      ? `<button class="focus-rec model" type="button" data-model-text="${esc(group.examples.map((e) => e.word).join(", "))}" data-model-words='${esc(JSON.stringify(group.examples.map((e) => e.word)))}'>
           <span class="play-icon"></span>
           <span class="word-label">Play model</span>
         </button>`
      : "";

    const tipHtml = group.tip
      ? `<div class="focus-tip"><strong>Tip:</strong> ${esc(group.tip)}</div>`
      : "";

    // The "In your session" line — list words with their scores.
    const wordList = group.examples
      .map((ex) => `<strong>${esc(ex.word)}</strong> (${esc(ex.score)})`)
      .join(", ");

    return `
      <div class="focus-group">
        <div class="focus-header">
          <span class="focus-phoneme">${headerLabel}</span>
          <span class="${tierClass}" style="font-weight: 600;">${tierLabel}</span>
        </div>
        <div class="focus-words">In your session: ${wordList}</div>
        <div class="focus-recordings">${recButtons}${modelButton}</div>
        ${tipHtml}
      </div>
    `;
  }

  function renderFocusAreas(report, recordingMap) {
    if (!report.focusAreas || !report.focusAreas.length) {
      const t1Flagged = report.qualityFlags && report.qualityFlags.task1 && report.qualityFlags.task1.flagged;
      const labelsMissing = report.phonemeLabelsAvailable === false;
      let lead;
      if (t1Flagged) {
        lead = "Couldn't pull focus areas from this session — most Task 1 recordings had no clear speech detected. Please retake this part.";
      } else if (labelsMissing) {
        lead = "Couldn't analyse individual sounds for this session — Azure returned no phoneme labels in the response. This is a configuration issue, not a pronunciation issue. Try the test again; if it persists, the SDK call needs another look.";
      } else {
        lead = `No individual phonemes scored below ${Scoring.FOCUS_THRESHOLD} this session — nice work.`;
      }
      return `
        <div class="report-card">
          <h2>What to work on</h2>
          <p class="lead">${esc(lead)}</p>
        </div>
      `;
    }

    const groups = report.focusAreas
      .map((g) => focusGroupHtml(g, recordingMap))
      .join("");

    // Show the "short word audio caveat" warning if any focus example came
    // from a 1-syllable Task 1 word — short audio at the edges can score low
    // for reasons that aren't really pronunciation issues.
    const hasShortWord = report.focusAreas.some((g) =>
      g.examples.some((ex) => {
        const wordLen = (ex.word || "").length;
        return wordLen <= 4;
      })
    );

    const warning = hasShortWord
      ? `<div class="note note-warn">Some of these low scores may be partly due to recording quality on short words — the audio system can lose detail at the edges of brief sounds. Worth listening to your recordings before assuming a real pronunciation issue.</div>`
      : "";

    return `
      <div class="report-card">
        <h2>What to work on</h2>
        ${groups}
        ${warning}
      </div>
    `;
  }

  // =============================================================================
  // Section 6 — Listening (Task 3 round 1)
  // =============================================================================

  function renderListening(report) {
    const items = report.listening || [];
    if (!items.length) {
      return `
        <div class="report-card">
          <h2>How well you heard the differences</h2>
          <p class="lead">No listening data this session.</p>
        </div>
      `;
    }

    const correct = report.perception.correct;
    const total = report.perception.total;

    const rows = items.map((it) => {
      const indicator =
        it.round1_correct === true ? `<span class="check">✓ correct</span>`
        : it.round1_correct === false ? `<span class="cross">✗ missed</span>`
        : `<span class="dash">—</span>`;

      const wordsBit = it.word_a && it.word_b
        ? ` <span class="pair-words">(${esc(it.word_a)} / ${esc(it.word_b)})</span>`
        : "";

      // Bold the row if it's the (single) miss to draw the eye, like the mockup.
      const isOnlyMiss = total - correct === 1 && it.round1_correct === false;
      const labelHtml = isOnlyMiss
        ? `<strong>${esc(it.contrast)}</strong>${wordsBit}`
        : `${esc(it.contrast)}${wordsBit}`;

      return `
        <div class="pair-row">
          <span class="label">${labelHtml}</span>
          ${indicator}
        </div>
      `;
    }).join("");

    let narrative = "";
    if (total === correct && total > 0) {
      narrative = `<div class="note">Perfect score on perception — you heard every contrast we tested.</div>`;
    } else if (total - correct === 1) {
      const miss = items.find((i) => i.round1_correct === false);
      if (miss) {
        narrative = `<div class="note">Your only miss (${esc(miss.contrast)}) suggests this contrast might be worth practising.</div>`;
      }
    } else if (total - correct >= 2) {
      const misses = items.filter((i) => i.round1_correct === false).slice(0, 3).map((m) => m.contrast);
      narrative = `<div class="note">You missed ${total - correct} of ${total} — focus areas would be ${misses.join(", ")}.</div>`;
    }

    return `
      <div class="report-card">
        <h2>How well you heard the differences</h2>
        <p class="lead">You got <strong>${correct} out of ${total}</strong> right when listening for similar sounds.</p>
        ${rows}
        ${narrative}
      </div>
    `;
  }

  // =============================================================================
  // Section 7 — Sentence stability (Task 1 vs Task 2)
  // =============================================================================

  function stabilityNarrative(t1, t2) {
    if (typeof t1 !== "number" || typeof t2 !== "number") {
      return "We need both single-word and sentence data to compare how your pronunciation holds up across sentence length.";
    }
    const diff = t2 - t1;
    if (diff > 5) {
      return `Your sentence pronunciation is <strong>${Math.abs(diff)} points higher</strong> than your single-word pronunciation. This is unusual — most learners lose ground across a full sentence, not gain it. Your pronunciation holds steady (or strengthens) under sentence-level load.`;
    }
    if (diff < -5) {
      return `Your sentence pronunciation drops <strong>${Math.abs(diff)} points</strong> compared to single words. This is the most common pattern — coordinating several sounds in a row adds load that can erode individual sounds.`;
    }
    return `Your single-word and sentence pronunciation are <strong>about the same level</strong>. That's a steady baseline — sentence length isn't degrading your individual sounds.`;
  }

  function renderSentenceStability(report) {
    const t1 = report.sectionScores.task1;
    const t2 = report.sectionScores.task2;

    const cls1 = Scoring.scoreClass(t1);
    const cls2 = Scoring.scoreClass(t2);
    const narrative = stabilityNarrative(t1, t2);

    return `
      <div class="report-card">
        <h2>Words vs sentences</h2>
        <div class="compare">
          <div class="compare-side">
            <div class="lbl">Single words</div>
            <div class="num ${cls1}">${esc(fmt(t1))}</div>
          </div>
          <div class="compare-side">
            <div class="lbl">In sentences</div>
            <div class="num ${cls2}">${esc(fmt(t2))}</div>
          </div>
        </div>
        <p class="compare-narrative">${narrative}</p>
      </div>
    `;
  }

  // =============================================================================
  // Section 8 — Free speech
  // =============================================================================

  function renderFreeSpeech(report) {
    const fs = report.freeSpeech;
    if (!fs || fs.state === "absent") {
      return `
        <div class="report-card">
          <h2>Free speech</h2>
          <p class="lead">We didn't get usable data from the free speech section in this session. Try again to add this part of the picture — it shows how your pronunciation holds up when you choose your own words.</p>
        </div>
      `;
    }

    if (fs.state === "low_confidence") {
      return `
        <div class="report-card">
          <h2>Free speech</h2>
          <div class="note note-empty">We captured ${fs.attempts} attempt${fs.attempts === 1 ? "" : "s"} but couldn't get a clear enough transcript to score them. Try again in a quieter space, or speak a touch louder and more slowly.</div>
        </div>
      `;
    }

    const items = fs.items.map((it) => `
      <div class="free-item">
        <div class="prompt">${esc(it.prompt_text)}</div>
        <div class="transcript">"${esc((it.transcript || "").slice(0, 220))}${(it.transcript || "").length > 220 ? "…" : ""}"</div>
        <div class="free-stats">
          <span><strong>${esc(fmt(it.accuracy))}</strong> accuracy</span>
          <span><strong>${esc(fmt(it.fluency))}</strong> fluency</span>
          <span><strong>${esc(fmt(it.prosody))}</strong> prosody</span>
        </div>
      </div>
    `).join("");

    return `
      <div class="report-card">
        <h2>Free speech</h2>
        <p class="lead">Three open prompts. Average pronunciation score: <strong>${esc(fmt(fs.meanPron))}</strong>.</p>
        <div class="free-items">${items}</div>
      </div>
    `;
  }

  // =============================================================================
  // Modals — "How is this score calculated?" + per-dimension popups
  // =============================================================================

  function renderHowModal() {
    return `
      <div class="modal-backdrop" id="howModal" role="dialog" aria-modal="true" aria-labelledby="howModalTitle">
        <div class="modal">
          <h3 id="howModalTitle">How your score is calculated</h3>
          <p class="sub">Built on Microsoft Azure Speech AI · calibrated for English L2 learners</p>

          <h4>The data source</h4>
          <p>Every recording is sent to <strong>Azure Speech Services Pronunciation Assessment</strong> — the same speech AI used by Microsoft Reading Coach and a number of major language-learning platforms. It returns scores per individual sound, per syllable, and per sentence, plus pacing and intonation signals.</p>

          <h4>The five dimensions</h4>
          <table>
            <thead><tr><th>Dimension</th><th>Weight</th><th>What it measures</th></tr></thead>
            <tbody>
              <tr><td>Phoneme accuracy</td><td>25%</td><td>Are the individual sounds correct?</td></tr>
              <tr><td>Fluency</td><td>22%</td><td>Does speech flow at a natural pace, without unnatural pauses?</td></tr>
              <tr><td>Word stress</td><td>18%</td><td>Is the right syllable emphasised in each word?</td></tr>
              <tr><td>Consistency</td><td>18%</td><td>Is performance steady across items, or does it swing?</td></tr>
              <tr><td>Sentence stability</td><td>17%</td><td>Does pronunciation hold steady when words combine into sentences?</td></tr>
            </tbody>
          </table>

          <h4>The formula</h4>
          <div class="formula">
            Score = (Phoneme × 0.25)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (Fluency × 0.22)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (Stress × 0.18)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (Consistency × 0.18)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (Stability × 0.17)
          </div>

          <h4>Score bands</h4>
          <table>
            <tbody>
              <tr><td><strong>85–100</strong></td><td>Clear and confident</td></tr>
              <tr><td><strong>70–84</strong></td><td>Generally clear, some patterns to refine</td></tr>
              <tr><td><strong>55–69</strong></td><td>Comprehensible but inconsistent</td></tr>
              <tr><td><strong>40–54</strong></td><td>Listener has to work to follow</td></tr>
              <tr><td><strong>0–39</strong></td><td>Difficult for a listener to follow</td></tr>
            </tbody>
          </table>

          <h4>Why a composite, not a single number?</h4>
          <p>Two learners can both score 80 overall — one through consistently good performance, one through a mix of strong and weak items. Listeners experience these very differently. The five dimensions make that difference visible, and let learners see <em>where</em> to focus, not just <em>how well</em> they did.</p>

          <button class="modal-close" data-close="howModal" type="button">Got it</button>
        </div>
      </div>
    `;
  }

  function renderDimModal() {
    return `
      <div class="modal-backdrop" id="dimModal" role="dialog" aria-modal="true" aria-labelledby="dimModalTitle">
        <div class="modal">
          <h3 id="dimModalTitle">—</h3>
          <p class="sub" id="dimModalSub">—</p>
          <h4>What it measures</h4>
          <p id="dimWhat">—</p>
          <h4>How it's calculated</h4>
          <p id="dimHow">—</p>
          <h4>Why it matters</h4>
          <p id="dimWhy">—</p>
          <button class="modal-close" data-close="dimModal" type="button">Got it</button>
        </div>
      </div>
    `;
  }

  // =============================================================================
  // Session details — descriptive stats card (no traffic-light colouring).
  // Computed from the live session object so the numbers match what was
  // actually captured in this run.
  // =============================================================================

  function wordCount(s) {
    if (typeof s !== "string") return 0;
    const t = s.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  // Words a single result contributes. Prefer Azure-recognised text (PA `text`
  // for T1/2/3, STT `transcript` for T4); fall back to the reference text we
  // *asked* them to say if the Azure call errored or returned blank.
  function resultWords(r, refText) {
    const a = r && r.azure;
    if (a && !a.error) {
      if (typeof a.text === "string" && a.text.trim()) return wordCount(a.text);
      if (typeof a.transcript === "string" && a.transcript.trim()) return wordCount(a.transcript);
    }
    return wordCount(refText);
  }

  function durMs(r) {
    return Number.isFinite(r && r.durationMs) ? r.durationMs : 0;
  }

  function fmtClock(totalMs) {
    const s = Math.max(0, Math.round(totalMs / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  // words / (ms / 60_000) → wpm; null if either input is unusable.
  function wpm(words, ms) {
    if (!words || !ms || ms < 1000) return null;
    return Math.round(words / (ms / 60000));
  }

  function computeSessionStats(session) {
    const t1 = session.task1.results || [];
    const t2 = session.task2.results || [];
    const t3 = session.task3.results || []; // durationMs here is Round 2 only
    const t4 = session.task4.results || [];

    const t1Words = t1.reduce((sum, r) => sum + resultWords(r, r.word), 0);
    const t2Words = t2.reduce((sum, r) => sum + resultWords(r, r.text), 0);
    const t3Words = t3.reduce((sum, r) => sum + resultWords(r, r.target_word), 0);
    const t4Words = t4.reduce((sum, r) => sum + resultWords(r, ""), 0);

    const t1Time = t1.reduce((sum, r) => sum + durMs(r), 0);
    const t2Time = t2.reduce((sum, r) => sum + durMs(r), 0);
    const t3Time = t3.reduce((sum, r) => sum + durMs(r), 0);
    const t4Time = t4.reduce((sum, r) => sum + durMs(r), 0);

    const readingWords = t1Words + t2Words + t3Words;
    const readingTime = t1Time + t2Time + t3Time;
    const totalWords = readingWords + t4Words;
    const totalTime = readingTime + t4Time;

    return {
      totalWords,
      totalTime,
      readingRate: wpm(readingWords, readingTime),
      freeRate: wpm(t4Words, t4Time),
      hintsUsed: (session.task1.hintLog || []).length,
      hintsTotal: 15, // 15 scored words in Task 1 (practice excluded)
    };
  }

  function renderSessionDetails(session, report) {
    const s = computeSessionStats(session);

    const reading = typeof s.readingRate === "number"
      ? `<div class="val" style="color:#1F2937;">${s.readingRate}</div>`
      : `<div class="val score-na">—</div>`;
    const free = typeof s.freeRate === "number"
      ? `<div class="val" style="color:#1F2937;">${s.freeRate}</div>`
      : `<div class="val score-na">—</div>`;

    const unscoredTotal = report && typeof report.unscoredTotal === "number" ? report.unscoredTotal : 0;
    const itemsTotal = report && typeof report.itemsTotal === "number" ? report.itemsTotal : 0;
    const unscoredTile = unscoredTotal > 0
      ? `
          <div class="section-tile">
            <div class="name">Unscored items</div>
            <div class="score-num score-low">${unscoredTotal}/${itemsTotal}</div>
            <div class="desc">no clear speech detected</div>
          </div>
        `
      : "";

    return `
      <div class="report-card">
        <h2>Session details</h2>
        <div class="sections" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
          <div class="section-tile">
            <div class="name">Words spoken</div>
            <div class="score-num" style="color:#1F2937;">${s.totalWords}</div>
            <div class="desc">across all 4 tasks</div>
          </div>
          <div class="section-tile">
            <div class="name">Speaking time</div>
            <div class="score-num" style="color:#1F2937;">${esc(fmtClock(s.totalTime))}</div>
            <div class="desc">total recorded</div>
          </div>
          <div class="section-tile">
            <div class="name">Speech rate</div>
            <div class="split-scores">
              <div class="col">
                <div class="lbl">Reading</div>
                ${reading}
              </div>
              <div class="col">
                <div class="lbl">Free</div>
                ${free}
              </div>
            </div>
            <div class="desc">words per minute</div>
          </div>
          <div class="section-tile">
            <div class="name">Hints used</div>
            <div class="score-num" style="color:#1F2937;">${s.hintsUsed}/${s.hintsTotal}</div>
            <div class="desc">in word task</div>
          </div>
          ${unscoredTile}
        </div>
        <div class="note" style="margin-top:16px;">
          <strong>Reading vs free speech:</strong> the reading rate covers Tasks 1, 2, and 3 — all script-based, so the words are chosen for you. The free rate (Task 4) is when you pick your own words, which is the more useful diagnostic for fluency. Native English conversational pace is roughly 150–180 wpm; read-aloud and L2 free speech are naturally slower.
        </div>
      </div>
    `;
  }

  // =============================================================================
  // Detailed analysis page — per-word stress visualisation.
  // Pure render-and-classify on data we already capture (Words[].Syllables[]).
  // No new Azure calls. Single-syllable words are skipped — they have no
  // stress to assess.
  // =============================================================================

  // Azure returns Offset/Duration in 100-nanosecond units (the SDK convention).
  // Divide by 10^7 to get seconds.
  const HUNDRED_NS = 10000000;

  function ordinal(n) {
    if (n <= 0) return String(n);
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  function lookupIpa(session, wordId, fallbackWord) {
    const list = (session.data && session.data.words) || [];
    const hit = list.find((w) => w.id === wordId)
      || list.find((w) => (w.word || "").toLowerCase() === (fallbackWord || "").toLowerCase());
    return hit && hit.ipa ? hit.ipa : "";
  }

  // Pull the syllable array off a Task 1 result. Returns null if Azure errored,
  // returned no Words, or the syllable durations are missing — in which case
  // the caller skips the row silently.
  function extractSyllables(result) {
    const azure = result && result.azure;
    if (!azure || azure.error) return null;
    const word = azure.json
      && azure.json.NBest
      && azure.json.NBest[0]
      && azure.json.NBest[0].Words
      && azure.json.NBest[0].Words[0];
    if (!word || !Array.isArray(word.Syllables) || word.Syllables.length === 0) return null;
    const sylls = word.Syllables.map((s) => ({
      text: s.Grapheme || s.Syllable || "",
      duration: typeof s.Duration === "number" ? s.Duration : 0,
      score: s.PronunciationAssessment && s.PronunciationAssessment.AccuracyScore,
    }));
    if (sylls.some((s) => !s.duration || s.duration <= 0)) return null;
    return sylls;
  }

  function wordLevelScore(result) {
    const word = result && result.azure && result.azure.json
      && result.azure.json.NBest && result.azure.json.NBest[0]
      && result.azure.json.NBest[0].Words && result.azure.json.NBest[0].Words[0];
    const acc = word && word.PronunciationAssessment && word.PronunciationAssessment.AccuracyScore;
    return typeof acc === "number" ? Math.round(acc) : null;
  }

  // Returns the index of the primary stress in a stress_pattern array, or
  // null if the pattern is malformed.
  function expectedStressIdx(pattern) {
    if (!Array.isArray(pattern)) return null;
    const idx = pattern.indexOf(1);
    return idx >= 0 ? idx : null;
  }

  // Stress-correctness logic with word-final lengthening compensation.
  //
  // The stressed syllable should be the longest. If the actual longest is the
  // LAST syllable AND the second-longest sits at the expected stress position,
  // we treat it as correct — word-final syllables can naturally lengthen even
  // when the speaker stressed earlier in the word (classic case: "electricity"
  // where "ty" ends up longest because it's word-final).
  function classifyStress(durations, expectedIdx) {
    if (!durations.length || expectedIdx == null) return null;
    const sorted = durations.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d);
    const longestIdx = sorted[0].i;
    const secondIdx = sorted.length > 1 ? sorted[1].i : null;

    let actualIdx = longestIdx;
    let compensated = false;
    if (longestIdx !== expectedIdx
        && longestIdx === durations.length - 1
        && secondIdx === expectedIdx) {
      actualIdx = secondIdx;
      compensated = true;
    }
    return {
      expectedIdx,
      actualIdx,
      longestIdx,
      compensated,
      correct: actualIdx === expectedIdx,
    };
  }

  function renderWordDetail(result, ipa) {
    const sylls = extractSyllables(result);
    if (!sylls) return ""; // Skip silently — broken row would mislead worse.

    const expIdx = expectedStressIdx(result.stress_pattern);
    if (expIdx == null) return "";

    const durations = sylls.map((s) => s.duration);
    const verdict = classifyStress(durations, expIdx);
    if (!verdict) return "";

    const expectedSyl = sylls[expIdx];
    const actualSyl = sylls[verdict.actualIdx];

    const meta = `${sylls.length} syllables · stress on ${ordinal(expIdx + 1)} (${esc((expectedSyl.text || "").toUpperCase())})`;

    // Bar widths: each .syl-bar takes flex = duration in 0.1s units. So a
    // 0.39s syllable becomes flex: 3.9. Matches the mockup's hand-coded values.
    function flexFor(s) { return (s.duration / HUNDRED_NS / 0.1).toFixed(1); }
    function durSec(s) { return (s.duration / HUNDRED_NS).toFixed(2); }

    const bars = sylls.map((s, i) => {
      const isExp = i === verdict.expectedIdx;
      const isAct = i === verdict.actualIdx;
      const cls = ["syl-bar"];
      if (isExp && isAct) cls.push("both");
      else if (isExp) cls.push("stressed-expected");
      else if (isAct) cls.push("stressed-actual");
      return `<div class="${cls.join(" ")}" style="flex:${flexFor(s)};">${esc(s.text)}</div>`;
    }).join("");

    const durs = sylls.map((s) =>
      `<span class="syl-dur" style="flex:${flexFor(s)};">${durSec(s)}s</span>`
    ).join("");

    // The verdict pill is the score for this view — page 2 is purely about
    // stress placement, not overall word accuracy. We deliberately don't
    // render the per-word AccuracyScore here; showing "82" next to "wrong
    // stress" reads as a contradiction. Overall accuracy still lives on
    // page 1 (sections, dimensions, focus areas).
    const verdictHtml = verdict.correct
      ? `<span class="stress-verdict verdict-ok">✓ Stress placed correctly${verdict.compensated ? " (allowing for word-final lengthening)" : ""}</span>`
      : `<span class="stress-verdict verdict-off">Stress placed on "${esc(actualSyl.text)}" — should be on "${esc((expectedSyl.text || "").toUpperCase())}"</span>`;

    return `
      <div class="word-detail">
        <div class="word-detail-head">
          <span class="wd-word">${esc(result.word)}</span>${ipa ? `<span class="wd-ipa">${esc(ipa)}</span>` : ""}
        </div>
        <div class="wd-meta">${meta}</div>
        <div class="syllable-bars">${bars}</div>
        <div class="syl-durations">${durs}</div>
        ${verdictHtml}
      </div>
    `;
  }

  // Static template-driven summary. The template branches on how many words
  // were assessed and how many were off-stress. No LLM, no surprise wording.
  function stressTakeaway(rows) {
    if (!rows.length) return "";
    const wrong = rows.filter((r) => !r.classify.correct);
    const wrongCount = wrong.length;
    const total = rows.length;

    function pickExample(r) {
      const exp = (r.expectedSyl.text || "").toUpperCase();
      const act = r.actualSyl.text || "";
      return { word: r.word, exp, act };
    }

    if (wrongCount === 0) {
      return "On every multi-syllable word in this session you placed stress correctly. That's a strong stress-placement instinct — keep it going.";
    }
    if (wrongCount === total) {
      const ex = pickExample(wrong[0]);
      return `Stress placement was off on every multi-syllable word in this session. A clear example: <strong>${esc(ex.word)}</strong>, where stress landed on "<em>${esc(ex.act)}</em>" instead of "<em>${esc(ex.exp)}</em>". Stress is a strong rhythmic cue in English — practising deliberate placement on these words would help.`;
    }
    if (wrongCount === 1) {
      const ex = pickExample(wrong[0]);
      return `On most multi-syllable words you placed stress correctly. The notable exception was <strong>${esc(ex.word)}</strong>, where you stressed "<em>${esc(ex.act)}</em>" instead of "<em>${esc(ex.exp)}</em>".`;
    }
    const ex = pickExample(wrong[0]);
    return `Most multi-syllable words landed stress correctly, but ${wrongCount} were off — the clearest example was <strong>${esc(ex.word)}</strong> (stress on "<em>${esc(ex.act)}</em>" instead of "<em>${esc(ex.exp)}</em>").`;
  }

  function renderDetailPage(session, report) {
    // 1. Filter to multi-syllable Task 1 words with usable Azure data.
    // 2. For each, classify stress + capture display data.
    // 3. Sort by score asc (most actionable first), then render.
    const rows = [];
    for (const r of (session.task1.results || [])) {
      if (!r || (r.syllables || 0) < 2) continue;
      const sylls = extractSyllables(r);
      if (!sylls) continue;
      const expIdx = expectedStressIdx(r.stress_pattern);
      if (expIdx == null) continue;
      const verdict = classifyStress(sylls.map((s) => s.duration), expIdx);
      if (!verdict) continue;
      const score = wordLevelScore(r);
      rows.push({
        result: r,
        word: r.word,
        score: score == null ? -1 : score,
        classify: verdict,
        expectedSyl: sylls[verdict.expectedIdx],
        actualSyl: sylls[verdict.actualIdx],
      });
    }
    rows.sort((a, b) => a.score - b.score);

    if (!rows.length) {
      const t1Flagged = report && report.qualityFlags && report.qualityFlags.task1 && report.qualityFlags.task1.flagged;
      const message = t1Flagged
        ? `Couldn't analyse stress for this session — most Task 1 recordings had no clear speech detected. Please retake the test in a quiet space with the mic close to you.`
        : `Not enough multi-syllable words in this session for a stress breakdown — try another session.`;
      return `
        <div class="page" data-page="detail">
          <div class="report-card">
            <h2>Detailed analysis</h2>
            <p class="muted">${esc(message)}</p>
          </div>
        </div>
      `;
    }

    const intro = `
      <div class="report-card">
        <h2>Detailed analysis</h2>
        <p class="muted" style="margin-bottom:8px;">A word-by-word breakdown showing how long each syllable lasted and where you placed your stress. The longest bar is the syllable you emphasised. The yellow-highlighted block is where the stress should fall.</p>
        <div class="legend">
          <span><span class="legend-swatch" style="background:#FCD34D;"></span>Where stress should fall</span>
          <span><span class="legend-swatch" style="background:#DBEAFE;"></span>Other syllables</span>
          <span><span class="legend-swatch" style="background:#10B981;"></span>Stress placed correctly</span>
        </div>
      </div>
    `;

    const wordsHtml = rows.map((row) => {
      const ipa = lookupIpa(session, row.result.word_id, row.word);
      return renderWordDetail(row.result, ipa);
    }).join("");

    const breakdowns = `
      <div class="report-card">
        <h2>Multi-syllable words from this session</h2>
        ${wordsHtml}
      </div>
    `;

    const takeaway = `
      <div class="report-card">
        <h2>What you can take from this</h2>
        <p style="line-height:1.7;">${stressTakeaway(rows)}</p>
      </div>
    `;

    const method = `
      <div class="report-card">
        <h2>About this view</h2>
        <p class="muted" style="line-height:1.6;">Bar widths show how long you held each syllable. In English, the stressed syllable is naturally longer than the unstressed ones. By comparing your timing against the expected stress pattern, we can see whether your stress placement matches a native speaker's.</p>
        <p class="muted" style="margin-top:10px; font-size:13px;">Note: word-final syllables can sometimes appear longest due to natural lengthening at the end of a word. The system compensates for this when judging stress placement.</p>
      </div>
    `;

    return `
      <div class="page" data-page="detail">
        ${intro}
        ${breakdowns}
        ${takeaway}
        ${method}
      </div>
    `;
  }

  function renderTabs() {
    return `
      <div class="tabs" role="tablist">
        <button class="tab active" type="button" data-page="summary" role="tab">Summary</button>
        <button class="tab" type="button" data-page="detail" role="tab">Detailed analysis</button>
      </div>
    `;
  }

  function bindTabs(root) {
    const tabs = Array.from(root.querySelectorAll(".tabs .tab"));
    const pages = Array.from(root.querySelectorAll(".page"));
    function show(name) {
      for (const t of tabs) t.classList.toggle("active", t.dataset.page === name);
      for (const p of pages) p.classList.toggle("active", p.dataset.page === name);
      window.scrollTo(0, 0);
    }
    for (const t of tabs) t.addEventListener("click", () => show(t.dataset.page));
    return function dispose() {
      // Listeners are torn down implicitly when innerHTML is replaced on
      // screen change; nothing to do here.
    };
  }

  // =============================================================================
  // Footer
  // =============================================================================

  function renderFooter(session, report) {
    const c = report.counts;
    const date = session.startedAt
      ? new Date(session.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
      : "today";
    const parts = [];
    if (c.task1) parts.push(`${c.task1} word${c.task1 === 1 ? "" : "s"}`);
    if (c.task2) parts.push(`${c.task2} sentence${c.task2 === 1 ? "" : "s"}`);
    if (c.task3) parts.push(`${c.task3} minimal pair${c.task3 === 1 ? "" : "s"}`);
    if (c.task4) parts.push(`${c.task4} free prompt${c.task4 === 1 ? "" : "s"}`);
    return `
      <div class="report-footer">
        Session run ${esc(date)} · ${parts.join(" · ")}
      </div>
    `;
  }

  // =============================================================================
  // Audio binding — "Play your recording" + lazy "Play model"
  // =============================================================================

  function bindAudio(root, session) {
    // Build a fast lookup: word_id → wavBlob (Task 1 only — focus areas come
    // from Task 1 words). Filter out null blobs so the buttons that *can't*
    // play are styled disabled.
    const recordingMap = new Map();
    for (const r of (session.task1.results || [])) {
      if (r.wavBlob) recordingMap.set(r.word_id, r.wavBlob);
    }

    // We track URLs (per blob) and HTMLAudioElement instances so we can
    // revoke + stop on dispose, and so a second click toggles play/pause
    // instead of stacking instances.
    const objectUrls = new Map(); // word_id → url
    const audioByButton = new WeakMap(); // button → Audio element
    const ttsCache = new Map(); // text → blob
    let activeAudio = null;
    let activeButton = null;

    function stopActive() {
      if (activeAudio) {
        try { activeAudio.pause(); } catch (_) {}
        try { activeAudio.currentTime = 0; } catch (_) {}
      }
      if (activeButton) activeButton.classList.remove("is-playing");
      activeAudio = null;
      activeButton = null;
    }

    function urlForBlob(key, blob) {
      if (objectUrls.has(key)) return objectUrls.get(key);
      const url = URL.createObjectURL(blob);
      objectUrls.set(key, url);
      return url;
    }

    function playElement(button, audio) {
      stopActive();
      activeAudio = audio;
      activeButton = button;
      button.classList.add("is-playing");
      audio.onended = () => {
        if (activeAudio === audio) stopActive();
      };
      audio.onerror = () => {
        if (activeAudio === audio) stopActive();
      };
      audio.play().catch(() => stopActive());
    }

    // Per-recording buttons
    root.querySelectorAll(".focus-rec[data-recording-key]").forEach((btn) => {
      const key = btn.getAttribute("data-recording-key");
      const blob = recordingMap.get(key);
      if (!blob) return;

      btn.addEventListener("click", () => {
        if (activeButton === btn) {
          stopActive();
          return;
        }
        let audio = audioByButton.get(btn);
        if (!audio) {
          audio = new Audio(urlForBlob(key, blob));
          audioByButton.set(btn, audio);
        }
        try { audio.currentTime = 0; } catch (_) {}
        playElement(btn, audio);
      });
    });

    // Model audio — lazy TTS. Speaks the focus example words separated by
    // pauses, e.g. "bath. food. zoo." That gives a clean reference signal
    // for the learner to compare against their recording.
    root.querySelectorAll(".focus-rec.model").forEach((btn) => {
      const wordsRaw = btn.getAttribute("data-model-words") || "[]";
      let words = [];
      try { words = JSON.parse(wordsRaw); } catch (_) {}
      const text = words.length ? words.join(". ") + "." : btn.getAttribute("data-model-text") || "";
      if (!text) { btn.disabled = true; return; }

      btn.addEventListener("click", async () => {
        if (activeButton === btn) {
          stopActive();
          return;
        }
        if (!ttsCache.has(text)) {
          if (!global.AzureSpeech || !global.AzureSpeech.synthesizeToBlob) {
            btn.disabled = true;
            return;
          }
          // Visually flag we're loading (the play icon will pause until ready)
          btn.classList.add("is-playing");
          activeButton = btn;
          try {
            const blob = await global.AzureSpeech.synthesizeToBlob(text);
            ttsCache.set(text, blob);
          } catch (err) {
            console.warn("Model audio TTS failed:", err);
            stopActive();
            btn.disabled = true;
            return;
          }
        }
        const blob = ttsCache.get(text);
        const url = urlForBlob(`__model__:${text}`, blob);
        let audio = audioByButton.get(btn);
        if (!audio) {
          audio = new Audio(url);
          audioByButton.set(btn, audio);
        } else {
          audio.src = url;
        }
        try { audio.currentTime = 0; } catch (_) {}
        playElement(btn, audio);
      });
    });

    return function disposeAudio() {
      stopActive();
      for (const url of objectUrls.values()) {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }
      objectUrls.clear();
      ttsCache.clear();
    };
  }

  // =============================================================================
  // Modal binding
  // =============================================================================

  function bindModals(root) {
    const howModal = root.querySelector("#howModal");
    const dimModal = root.querySelector("#dimModal");

    function openHow() { if (howModal) howModal.classList.add("open"); }
    function openDim(key) {
      if (!dimModal) return;
      const info = DIM_INFO[key];
      if (!info) return;
      dimModal.querySelector("#dimModalTitle").textContent = info.title;
      dimModal.querySelector("#dimModalSub").textContent = info.sub;
      dimModal.querySelector("#dimWhat").textContent = info.what;
      dimModal.querySelector("#dimHow").textContent = info.how;
      dimModal.querySelector("#dimWhy").textContent = info.why;
      dimModal.classList.add("open");
    }
    function closeAll() {
      if (howModal) howModal.classList.remove("open");
      if (dimModal) dimModal.classList.remove("open");
    }

    // Backdrop click closes (only when the click is on the backdrop itself)
    [howModal, dimModal].forEach((m) => {
      if (!m) return;
      m.addEventListener("click", (e) => {
        if (e.target === m) m.classList.remove("open");
      });
    });

    // Buttons that open modals
    root.querySelectorAll('[data-modal="how"]').forEach((b) =>
      b.addEventListener("click", openHow)
    );
    root.querySelectorAll('[data-modal="dim"]').forEach((b) =>
      b.addEventListener("click", () => openDim(b.getAttribute("data-dim")))
    );

    // Close buttons
    root.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-close");
        const m = root.querySelector(`#${id}`);
        if (m) m.classList.remove("open");
      })
    );

    // Escape key
    function onKey(e) {
      if (e.key === "Escape") closeAll();
    }
    document.addEventListener("keydown", onKey);
    return function dispose() {
      document.removeEventListener("keydown", onKey);
    };
  }

  // =============================================================================
  // Compose
  // =============================================================================

  function render(root, session, next) {
    const tips = (session.data && session.data.tips) || {};
    const report = Scoring.compute(session, { tips });

    // Stash the report on the session for debug/download convenience.
    session.scores = report;

    // Build the recording lookup that the focus-area renderer needs to know
    // whether to disable a button up-front.
    const recordingMap = new Map();
    for (const r of (session.task1.results || [])) {
      if (r.wavBlob) recordingMap.set(r.word_id, r.wavBlob);
    }

    // Use the wider results layout
    root.classList.add("results-screen");
    if (root.parentElement) root.parentElement.classList.add("screen-wide");
    // The .screen has display:flex on it. Add a class to override gap if needed.

    // Hero, how-modal, footer, and the action buttons live OUTSIDE the page
    // tabs — hero/how-modal because the "i" affordance applies to the overall
    // score regardless of which page you're on; footer/btn-row because they
    // anchor the whole report. The dim-modal lives inside the summary page
    // because dim "i" buttons only exist there.
    root.innerHTML = `
      ${renderHero(report)}
      ${renderHowModal()}

      ${renderTabs()}

      <div class="page active" data-page="summary">
        ${renderSections(report)}

        ${renderDimensions(report)}
        ${renderDimModal()}

        ${renderStrengths(report)}

        ${renderFocusAreas(report, recordingMap)}

        ${renderListening(report)}

        ${renderSentenceStability(report)}

        ${renderFreeSpeech(report)}

        ${renderSessionDetails(session, report)}
      </div>

      ${renderDetailPage(session, report)}

      ${renderFooter(session, report)}

      <div class="btn-row">
        <button class="btn btn-secondary" id="downloadJson" type="button">Download session JSON</button>
        <button class="btn" id="restart" type="button">Run again</button>
      </div>
    `;

    const disposeTabs = bindTabs(root);
    const disposeModals = bindModals(root);
    const disposeAudio = bindAudio(root, session);

    root.querySelector("#downloadJson").addEventListener("click", () => {
      const dump = buildSessionDump(session, report);
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      Utils.downloadBlob(blob, `aze-session-${session.seed}.json`);
    });

    root.querySelector("#restart").addEventListener("click", () => {
      if (typeof next === "function") next("WELCOME");
    });

    return function disposeResults() {
      disposeAudio();
      disposeModals();
      disposeTabs();
      root.classList.remove("results-screen");
      if (root.parentElement) root.parentElement.classList.remove("screen-wide");
    };
  }

  // Strip blobs / pending promises so the JSON dump is serialisable.
  function buildSessionDump(session, report) {
    function stripTask(t) {
      if (!t || !t.results) return t;
      return {
        ...t,
        results: t.results.map((r) => {
          const { wavBlob, pendingAzure, ...rest } = r;
          return { ...rest, hasRecording: !!wavBlob };
        }),
      };
    }
    return {
      seed: session.seed,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      task1: stripTask(session.task1),
      task2: stripTask(session.task2),
      task3: stripTask(session.task3),
      task4: stripTask(session.task4),
      report,
    };
  }

  global.Results = { render };
})(window);
