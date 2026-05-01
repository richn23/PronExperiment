/* scoring.js — pure compute, no DOM. Maps captured Azure data → 5-dimension report.
 *
 * Public API:
 *   Scoring.compute(session, opts?)   → full report object
 *   Scoring.bandLabel(score)          → string
 *   Scoring.scoreClass(score)         → "score-high" | "score-mid" | "score-low" | "score-na"
 *   Scoring.WEIGHTS                   → composite weights (read-only object)
 *
 * The compute() output is consumed by results.js for rendering. Keeping it
 * pure means it's also testable directly (see scoring.test.html for fixtures).
 *
 * Constants are exposed at the top so they can be tuned from real session data.
 */

(function (global) {
  // =============================================================================
  // Tunable constants
  // =============================================================================

  // Sentence-stability penalty: (Task 1 phoneme avg − Task 2 phoneme avg) ×
  // multiplier → score deduction. Measures how much accuracy drops between
  // single words and full sentences. NOTE: this is *not* a measure of true
  // connected-speech features (linking, reductions, weak forms) — those will
  // get their own dimension when we have data to calibrate them.
  const SENTENCE_STABILITY_MULTIPLIER = 3;

  // Consistency penalty: stdDev (in points) × multiplier → score deduction
  const CONSISTENCY_MULTIPLIER = 3;

  // Composite weights — must sum to 1.0
  const WEIGHTS = Object.freeze({
    phoneme: 0.25,
    fluency: 0.22,
    stress: 0.18,
    consistency: 0.18,
    sentenceStability: 0.17,
  });

  // Strengths: every phoneme in the word must score ≥ this
  const STRENGTH_PHONEME_MIN = 85;

  // Focus: any word whose worst phoneme (or word-level fallback) is < this
  const FOCUS_THRESHOLD = 80;

  // How many phoneme groups to show, and how many example words per group
  const FOCUS_GROUPS_MAX = 6;
  const FOCUS_EXAMPLES_PER_GROUP = 3;

  // Score band thresholds — used by bandLabel() and scoreClass()
  const BAND_HIGH = 85;
  const BAND_MID_LOW = 65;

  // =============================================================================
  // Small helpers
  // =============================================================================

  function isNum(x) { return typeof x === "number" && isFinite(x); }

  function mean(arr) {
    if (!arr || !arr.length) return null;
    let sum = 0, n = 0;
    for (const x of arr) if (isNum(x)) { sum += x; n++; }
    return n === 0 ? null : sum / n;
  }

  function stdDev(arr) {
    if (!arr || arr.length < 2) return null;
    const filtered = arr.filter(isNum);
    if (filtered.length < 2) return null;
    const m = filtered.reduce((s, x) => s + x, 0) / filtered.length;
    const v = filtered.reduce((s, x) => s + (x - m) * (x - m), 0) / filtered.length;
    return Math.sqrt(v);
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function roundOrNull(x) { return isNum(x) ? Math.round(x) : null; }

  function bandLabel(score) {
    if (!isNum(score)) return "—";
    if (score >= 85) return "Clear and confident";
    if (score >= 70) return "Generally clear, some patterns to refine";
    if (score >= 55) return "Comprehensible but inconsistent";
    if (score >= 40) return "Listener has to work to follow";
    return "Difficult for a listener to follow";
  }

  function scoreClass(score) {
    if (!isNum(score)) return "score-na";
    if (score >= BAND_HIGH) return "score-high";
    if (score >= BAND_MID_LOW) return "score-mid";
    return "score-low";
  }

  // =============================================================================
  // Azure envelope readers — robust to missing fields, errors, and the two
  // shapes we have (Tasks 1/2/3 PA vs Task 4 STT→PA chain).
  // =============================================================================

  function nbest(azure) {
    if (!azure) return null;
    if (azure.error) return null;
    if (azure.lowConfidence) return null;
    const root = azure.json || (azure.paResult && azure.paResult.json) || null;
    if (!root || !root.NBest || !root.NBest[0]) return null;
    return root.NBest[0];
  }

  function paBlock(azure) {
    const n = nbest(azure);
    return n ? n.PronunciationAssessment : null;
  }

  function wordsOf(azure) {
    const n = nbest(azure);
    return n && Array.isArray(n.Words) ? n.Words : [];
  }

  // Returns the per-phoneme accuracy scores (numbers) across all Words.
  function phonemeAccuracies(words) {
    const out = [];
    for (const w of words) {
      const ph = w.Phonemes || [];
      for (const p of ph) {
        const a = p.PronunciationAssessment && p.PronunciationAssessment.AccuracyScore;
        if (isNum(a)) out.push(a);
      }
    }
    return out;
  }

  function wordLevelAccuracy(azure) {
    const w = wordsOf(azure)[0];
    if (!w) return null;
    const a = w.PronunciationAssessment && w.PronunciationAssessment.AccuracyScore;
    return isNum(a) ? a : null;
  }

  function sentenceAccuracy(azure) {
    const pa = paBlock(azure);
    return pa && isNum(pa.AccuracyScore) ? pa.AccuracyScore : null;
  }

  // Mean of every per-phoneme score in this single result envelope. Used as
  // the per-item "phoneme average" for sentence-stability and consistency.
  function itemPhonemeAvg(r) {
    const accs = phonemeAccuracies(wordsOf(r.azure));
    return accs.length ? mean(accs) : null;
  }

  // =============================================================================
  // Stress mapping — for Task 1, work out which phonemes belong to the
  // stressed syllable (per the word bank's stress_pattern) and average them.
  //
  // Azure returns Syllables[] and Phonemes[] both with Offset/Duration. We
  // assign each phoneme to a syllable by time overlap. If syllable count
  // disagrees with the bank's stress_pattern length we fall back to evenly
  // distributing phonemes across the bank's syllable count.
  // =============================================================================

  function stressedPhonemeAccuracies(taskResult) {
    const stressPattern = taskResult.stress_pattern || [];
    const stressedIdx = stressPattern.indexOf(1); // primary stress only (v1 fallback)
    if (stressedIdx < 0) return [];

    const w = wordsOf(taskResult.azure)[0];
    if (!w) return [];

    const phs = w.Phonemes || [];
    const sylls = w.Syllables || [];

    if (!phs.length) return [];

    // Path A — Azure's syllable count matches the bank. Use offset overlap.
    if (sylls.length === stressPattern.length && sylls.length > 1) {
      const syl = sylls[stressedIdx];
      if (syl && isNum(syl.Offset) && isNum(syl.Duration)) {
        const sStart = syl.Offset;
        const sEnd = syl.Offset + syl.Duration;
        const out = [];
        for (const p of phs) {
          if (!isNum(p.Offset) || !isNum(p.Duration)) continue;
          const pStart = p.Offset;
          const pEnd = p.Offset + p.Duration;
          if (pStart < sEnd && pEnd > sStart) {
            const acc = p.PronunciationAssessment && p.PronunciationAssessment.AccuracyScore;
            if (isNum(acc)) out.push(acc);
          }
        }
        if (out.length) return out;
      }
    }

    // Path B — single-syllable word: every phoneme belongs to the stressed syllable.
    if (stressPattern.length === 1) {
      return phonemeAccuracies([w]);
    }

    // Path C — evenly distribute phonemes across the bank's syllable count.
    // Useful when Azure doesn't return Syllables[] (older SDKs) or counts disagree.
    const nSyl = stressPattern.length;
    const nPh = phs.length;
    if (nSyl === 0 || nPh === 0) return [];
    const startIdx = Math.floor((stressedIdx / nSyl) * nPh);
    const endIdx = Math.ceil(((stressedIdx + 1) / nSyl) * nPh);
    const out = [];
    for (let i = startIdx; i < endIdx && i < nPh; i++) {
      const acc = phs[i].PronunciationAssessment && phs[i].PronunciationAssessment.AccuracyScore;
      if (isNum(acc)) out.push(acc);
    }
    return out;
  }

  // =============================================================================
  // Section scores — what shows up in the "How you did in each part" tiles
  // =============================================================================

  function sectionTask1(session) {
    const accs = (session.task1.results || [])
      .map((r) => wordLevelAccuracy(r.azure))
      .filter(isNum);
    return accs.length ? mean(accs) : null;
  }

  function sectionTask2(session) {
    const accs = (session.task2.results || [])
      .map((r) => sentenceAccuracy(r.azure))
      .filter(isNum);
    return accs.length ? mean(accs) : null;
  }

  function sectionTask3Heard(session) {
    const rs = (session.task3.results || []).filter((r) => typeof r.round1_correct === "boolean");
    if (!rs.length) return null;
    const correct = rs.filter((r) => r.round1_correct).length;
    return (correct / rs.length) * 100;
  }

  // For Task 3 "Said" we want the accuracy of the target word inside the
  // carrier sentence (not the whole sentence — which is mostly the carrier).
  function task3TargetWordAccuracy(r) {
    const target = (r.heardWord || "").toLowerCase().replace(/[^\w']/g, "");
    if (!target) return null;
    const words = wordsOf(r.azure);
    if (!words.length) return null;
    for (const w of words) {
      const wText = (w.Word || "").toLowerCase().replace(/[^\w']/g, "");
      if (wText === target) {
        const a = w.PronunciationAssessment && w.PronunciationAssessment.AccuracyScore;
        if (isNum(a)) return a;
      }
    }
    // Fallback to overall sentence accuracy if the target word isn't found
    // (e.g. miscue replaced it). This shouldn't happen on clean recordings.
    return sentenceAccuracy(r.azure);
  }

  function sectionTask3Said(session) {
    const accs = (session.task3.results || []).map(task3TargetWordAccuracy).filter(isNum);
    return accs.length ? mean(accs) : null;
  }

  function sectionTask4(session) {
    const usable = (session.task4.results || []).filter((r) => {
      const pa = paBlock(r.azure);
      return pa && isNum(pa.PronScore);
    });
    if (!usable.length) return null;
    return mean(usable.map((r) => paBlock(r.azure).PronScore));
  }

  // =============================================================================
  // Strengths — Task 1 words where every phoneme scored ≥ STRENGTH_PHONEME_MIN
  // =============================================================================

  function computeStrengths(session) {
    const wordBank = (session.data && session.data.words) || [];
    const ipaByWordId = new Map(wordBank.map((w) => [w.id, w.ipa]));

    const out = [];
    for (const r of (session.task1.results || [])) {
      const w = wordsOf(r.azure)[0];
      if (!w) continue;
      const phs = w.Phonemes || [];
      const accs = phs
        .map((p) => p.PronunciationAssessment && p.PronunciationAssessment.AccuracyScore)
        .filter(isNum);
      if (!accs.length) continue;
      // Also require the word-level accuracy to be high — guards against the
      // edge case where every phoneme scored 90 but the word-level accuracy
      // came back low because of a miscue/insert.
      const wordAcc = w.PronunciationAssessment && w.PronunciationAssessment.AccuracyScore;
      if (!isNum(wordAcc) || wordAcc < STRENGTH_PHONEME_MIN) continue;
      if (accs.every((a) => a >= STRENGTH_PHONEME_MIN)) {
        out.push({
          word: r.word,
          word_id: r.word_id,
          ipa: ipaByWordId.get(r.word_id) || null,
          score: Math.round(wordAcc),
        });
      }
    }
    return out;
  }

  // =============================================================================
  // Focus areas — phoneme groups the learner should work on
  //
  // Per the brief + user instruction:
  //   • Group by actual phoneme code when Azure phoneme labels are populated.
  //   • Fall back to target_sound from the word bank when labels are empty.
  //   • Show example words from the session (max 3 per phoneme group).
  //   • Pull tip + label + example word from phoneme_tips.json by ARPABET key.
  // =============================================================================

  function computeFocusAreas(session, tips) {
    const candidates = [];

    for (const r of (session.task1.results || [])) {
      const w = wordsOf(r.azure)[0];
      if (!w) continue;
      const phs = w.Phonemes || [];

      // Find the lowest-scoring phoneme + its label (may be empty string)
      let lowestAcc = null;
      let lowestCodeRaw = null;
      let anyLabel = false;
      for (const p of phs) {
        const acc = p.PronunciationAssessment && p.PronunciationAssessment.AccuracyScore;
        if (!isNum(acc)) continue;
        const codeRaw = (p.Phoneme || "").trim();
        if (codeRaw) anyLabel = true;
        if (lowestAcc == null || acc < lowestAcc) {
          lowestAcc = acc;
          lowestCodeRaw = codeRaw;
        }
      }

      // Decide grouping code + score
      let groupCode = null;
      let groupScore = null;
      let scoreSource = "phoneme"; // "phoneme" | "fallback"

      if (anyLabel && lowestCodeRaw) {
        groupCode = lowestCodeRaw.toUpperCase();
        groupScore = lowestAcc;
      } else {
        // Fallback path — Azure didn't label phonemes. Use the bank's
        // target_sound and the word-level accuracy.
        groupCode = r.target_sound || null;
        const wAcc = w.PronunciationAssessment && w.PronunciationAssessment.AccuracyScore;
        groupScore = isNum(wAcc) ? wAcc : null;
        scoreSource = "fallback";
      }

      if (!groupCode || !isNum(groupScore)) continue;
      if (groupScore >= FOCUS_THRESHOLD) continue;

      candidates.push({
        code: groupCode,
        word: r.word,
        word_id: r.word_id,
        score: Math.round(groupScore),
        scoreSource,
        wavBlobRef: r.wavBlob || null,   // attached for "Play your recording"
        recording: !!r.wavBlob,
      });
    }

    // Group + sort
    const byCode = new Map();
    for (const c of candidates) {
      if (!byCode.has(c.code)) byCode.set(c.code, []);
      byCode.get(c.code).push(c);
    }

    const groups = [];
    for (const [code, words] of byCode) {
      words.sort((a, b) => a.score - b.score);
      const avg = words.reduce((s, w) => s + w.score, 0) / words.length;
      const tip = tips && tips[code];
      groups.push({
        code,
        avg: Math.round(avg),
        tier: avg < 65 ? "low" : "mid",
        examples: words.slice(0, FOCUS_EXAMPLES_PER_GROUP),
        label: tip && tip.label ? tip.label : code,
        example_word: tip && tip.example_word ? tip.example_word : null,
        tip: tip && tip.tip ? tip.tip : null,
        // Some groups (rare phonemes) won't have an entry in phoneme_tips.json.
        // The renderer can still display the code + words but skips the tip box.
      });
    }

    groups.sort((a, b) => a.avg - b.avg);
    return groups.slice(0, FOCUS_GROUPS_MAX);
  }

  // =============================================================================
  // Listening table — one row per Task 3 item, with both pair words for context
  // =============================================================================

  function computeListening(session) {
    const pairs = (session.data && session.data.pairs) || [];
    const byId = new Map(pairs.map((p) => [p.id, p]));

    return (session.task3.results || []).map((r) => {
      const pair = byId.get(r.pair_id);
      return {
        pair_id: r.pair_id,
        contrast: r.contrast,
        contrast_label: pair ? pair.contrast_label : null,
        word_a: pair ? pair.word_a : null,
        word_b: pair ? pair.word_b : null,
        heardWord: r.heardWord,
        otherWord: pair
          ? (r.heardWord === pair.word_a ? pair.word_b : pair.word_a)
          : null,
        round1_correct: r.round1_correct,
      };
    });
  }

  // =============================================================================
  // Free speech summary
  // =============================================================================

  function computeFreeSpeech(session) {
    const results = session.task4.results || [];
    if (!results.length) return { state: "absent" };

    const usable = results.filter((r) => {
      const pa = paBlock(r.azure);
      return pa && isNum(pa.PronScore);
    });

    if (!usable.length) return { state: "low_confidence", attempts: results.length };

    const items = usable.map((r) => {
      const pa = paBlock(r.azure);
      const transcriptText =
        (r.azure && r.azure.transcript) ||
        (r.azure && r.azure.paResult && r.azure.paResult.text) ||
        "";
      return {
        prompt_text: r.prompt_text,
        prompt_kind: r.prompt_kind,
        prompt_url: r.prompt_url || null,
        transcript: transcriptText,
        accuracy: roundOrNull(pa.AccuracyScore),
        fluency: roundOrNull(pa.FluencyScore),
        prosody: roundOrNull(pa.ProsodyScore),
        pron: roundOrNull(pa.PronScore),
      };
    });
    const meanPron = roundOrNull(mean(items.map((i) => i.pron)));
    return {
      state: "ok",
      meanPron,
      items,
    };
  }

  // =============================================================================
  // Composite — re-distributes weights over available dimensions so a missing
  // dimension doesn't deflate the overall score.
  // =============================================================================

  function compositeScore(dims) {
    let totalW = 0;
    let weighted = 0;
    for (const k of Object.keys(WEIGHTS)) {
      if (isNum(dims[k])) {
        weighted += dims[k] * WEIGHTS[k];
        totalW += WEIGHTS[k];
      }
    }
    return totalW === 0 ? null : weighted / totalW;
  }

  // =============================================================================
  // Main entry
  // =============================================================================

  function compute(session, opts) {
    opts = opts || {};
    const tips = opts.tips || (session.data && session.data.tips) || {};

    // Gather counts upfront (used in summary / footer)
    const counts = {
      task1: (session.task1 && session.task1.results || []).length,
      task2: (session.task2 && session.task2.results || []).length,
      task3: (session.task3 && session.task3.results || []).length,
      task4: (session.task4 && session.task4.results || []).length,
    };

    // ------------------------------------------------------------- Phoneme accuracy
    const allPhAcc = [];
    for (const t of [session.task1, session.task2, session.task3, session.task4]) {
      if (!t || !t.results) continue;
      for (const r of t.results) {
        const accs = phonemeAccuracies(wordsOf(r.azure));
        for (const a of accs) allPhAcc.push(a);
      }
    }
    const phonemeDim = allPhAcc.length ? mean(allPhAcc) : null;

    // ------------------------------------------------------------- Fluency
    const fluencyScores = [];
    for (const t of [session.task2, session.task4]) {
      if (!t || !t.results) continue;
      for (const r of t.results) {
        const pa = paBlock(r.azure);
        if (pa && isNum(pa.FluencyScore)) fluencyScores.push(pa.FluencyScore);
      }
    }
    const fluencyDim = fluencyScores.length ? mean(fluencyScores) : null;

    // ------------------------------------------------------------- Word stress
    const stressScoresPerWord = [];
    for (const r of (session.task1.results || [])) {
      const accs = stressedPhonemeAccuracies(r);
      if (accs.length) {
        const s = mean(accs);
        if (isNum(s)) stressScoresPerWord.push(s);
      }
    }
    const stressDim = stressScoresPerWord.length ? mean(stressScoresPerWord) : null;

    // ------------------------------------------------------------- Sentence stability
    // Compares Task 1 (single-word) phoneme accuracy to Task 2 (sentence)
    // phoneme accuracy. Holding steady or improving = 100; meaningful drop in
    // sentences = points off proportional to the gap.
    const t1ItemAvgs = (session.task1.results || []).map(itemPhonemeAvg).filter(isNum);
    const t2ItemAvgs = (session.task2.results || []).map(itemPhonemeAvg).filter(isNum);

    let stabilityDim = null;
    let stabilityT1 = null;
    let stabilityT2 = null;
    if (t1ItemAvgs.length && t2ItemAvgs.length) {
      stabilityT1 = mean(t1ItemAvgs);
      stabilityT2 = mean(t2ItemAvgs);
      const gap = stabilityT1 - stabilityT2; // positive = sentences are worse than words
      stabilityDim = gap <= 0 ? 100 : clamp(100 - gap * SENTENCE_STABILITY_MULTIPLIER, 0, 100);
    }

    // ------------------------------------------------------------- Consistency
    let consistencyDim = null;
    let consistencyStdDev = null;
    if (t1ItemAvgs.length >= 2) {
      consistencyStdDev = stdDev(t1ItemAvgs);
      if (isNum(consistencyStdDev)) {
        consistencyDim = clamp(100 - consistencyStdDev * CONSISTENCY_MULTIPLIER, 0, 100);
      }
    }

    const dimensions = {
      phoneme: phonemeDim,
      fluency: fluencyDim,
      stress: stressDim,
      consistency: consistencyDim,
      sentenceStability: stabilityDim,
    };

    const overallRaw = compositeScore(dimensions);

    // Section scores
    const sectionScores = {
      task1: sectionTask1(session),
      task2: sectionTask2(session),
      task3Heard: sectionTask3Heard(session),
      task3Said: sectionTask3Said(session),
      task4: sectionTask4(session),
    };

    // Perception / production helpers (used by listening narrative)
    const t3Results = (session.task3 && session.task3.results) || [];
    const perceptionCorrect = t3Results.filter((r) => r.round1_correct === true).length;
    const perceptionTotal = t3Results.filter((r) => typeof r.round1_correct === "boolean").length;

    const out = {
      overall: roundOrNull(overallRaw),
      band: bandLabel(overallRaw),
      dimensions: {
        phoneme: roundOrNull(dimensions.phoneme),
        fluency: roundOrNull(dimensions.fluency),
        stress: roundOrNull(dimensions.stress),
        consistency: roundOrNull(dimensions.consistency),
        sentenceStability: roundOrNull(dimensions.sentenceStability),
      },
      sectionScores: {
        task1: roundOrNull(sectionScores.task1),
        task2: roundOrNull(sectionScores.task2),
        task3Heard: roundOrNull(sectionScores.task3Heard),
        task3Said: roundOrNull(sectionScores.task3Said),
        task4: roundOrNull(sectionScores.task4),
      },
      counts,
      strengths: computeStrengths(session),
      focusAreas: computeFocusAreas(session, tips),
      listening: computeListening(session),
      freeSpeech: computeFreeSpeech(session),
      perception: {
        correct: perceptionCorrect,
        total: perceptionTotal,
      },
      // Diagnostic block (used by scoring.test.html and the dimensions card)
      diagnostics: {
        phonemesScored: allPhAcc.length,
        fluencyItems: fluencyScores.length,
        stressItems: stressScoresPerWord.length,
        stabilityT1Avg: roundOrNull(stabilityT1),
        stabilityT2Avg: roundOrNull(stabilityT2),
        consistencyStdDev: isNum(consistencyStdDev) ? Number(consistencyStdDev.toFixed(2)) : null,
      },
    };

    return out;
  }

  // =============================================================================
  // Public API
  // =============================================================================

  global.Scoring = {
    compute,
    bandLabel,
    scoreClass,
    WEIGHTS,
    SENTENCE_STABILITY_MULTIPLIER,
    CONSISTENCY_MULTIPLIER,
    FOCUS_THRESHOLD,
    STRENGTH_PHONEME_MIN,
  };
})(typeof window !== "undefined" ? window : globalThis);
