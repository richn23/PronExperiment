// AZE Pronunciation Focus — Scoring Engine V2
// Implements the V2 scoring spec:
//   5 scored dimensions + Clarity indicator (separate from composite)
//   New: Consistency dimension, stepped Connected Speech, simplified Fluency

// ============================================================
// MINIMUM DATA RULES
// ============================================================
export function meetsMinimumData(wordCount, duration) {
  return wordCount >= 20 && duration >= 10;
}

// ============================================================
// DIMENSION 1: Phoneme Accuracy (weight: 25%)
// Average quality_score across all phonemes in the session
// ============================================================
export function scorePhonemeAccuracy(wordScoreList) {
  const allPhonemes = [];
  for (const word of wordScoreList) {
    if (word.phone_score_list) {
      for (const phone of word.phone_score_list) {
        if (phone.quality_score !== undefined && phone.quality_score !== null) {
          allPhonemes.push(phone.quality_score);
        }
      }
    }
  }
  if (allPhonemes.length === 0) return null;
  return allPhonemes.reduce((sum, s) => sum + s, 0) / allPhonemes.length;
}

// ============================================================
// DIMENSION 2: Fluency (weight: 22%)
// V2: Uses speechace_score.fluency DIRECTLY
// No additional sub-metrics to avoid double-counting
// ============================================================
export function scoreFluency(fluencyMetrics) {
  return fluencyMetrics.speechace_fluency_score;
}

// ============================================================
// DIMENSION 3: Word Stress (weight: 18%)
// Average stress_score across all stress-bearing phonemes
// ============================================================
export function scoreWordStress(wordScoreList) {
  const stressScores = [];
  for (const word of wordScoreList) {
    if (word.phone_score_list) {
      for (const phone of word.phone_score_list) {
        if (phone.stress_score !== undefined && phone.stress_score !== null) {
          stressScores.push(phone.stress_score);
        }
      }
    }
  }
  if (stressScores.length === 0) return null;
  return stressScores.reduce((sum, s) => sum + s, 0) / stressScores.length;
}

// ============================================================
// DIMENSION 4: Consistency (weight: 18%) — NEW IN V2
// SD of item-level phoneme accuracy averages
// ============================================================
export function scoreConsistency(wordScoreList) {
  const itemAverages = [];
  for (const word of wordScoreList) {
    if (word.phone_score_list && word.phone_score_list.length > 0) {
      const avg = word.phone_score_list.reduce((s, p) => s + (p.quality_score || 0), 0) / word.phone_score_list.length;
      itemAverages.push(avg);
    }
  }
  if (itemAverages.length < 2) return { score: null, sd: null, range: null, flag: false };

  const mean = itemAverages.reduce((s, v) => s + v, 0) / itemAverages.length;
  const variance = itemAverages.reduce((s, v) => s + (v - mean) ** 2, 0) / itemAverages.length;
  const sd = Math.sqrt(variance);
  const range = Math.max(...itemAverages) - Math.min(...itemAverages);

  // Map SD to score per V2 spec:
  //   SD 0-5   → 90-100
  //   SD 6-10  → 75-89
  //   SD 11-15 → 60-74
  //   SD 16+   → below 60
  let score;
  if (sd <= 5) {
    score = 90 + (5 - sd) / 5 * 10;
  } else if (sd <= 10) {
    score = 75 + (10 - sd) / 5 * 14;
  } else if (sd <= 15) {
    score = 60 + (15 - sd) / 5 * 14;
  } else {
    score = Math.max(30, 60 - (sd - 15) / 5 * 15);
  }

  return {
    score: Math.round(score * 10) / 10,
    sd: Math.round(sd * 10) / 10,
    range: Math.round(range * 10) / 10,
    flag: range >= 30, // QA flag: max - min >= 30
  };
}

// ============================================================
// DIMENSION 5: Connected Speech (weight: 17%)
// V2: Stepped gap-to-score mapping (not linear)
// ============================================================
export function scoreConnectedSpeech(wordLevelAccuracy, sentenceLevelAccuracy) {
  if (wordLevelAccuracy === null || sentenceLevelAccuracy === null) return null;

  const gap = wordLevelAccuracy - sentenceLevelAccuracy;

  // V2 stepped mapping:
  if (gap <= 0) return 100;   // sentence >= word — no breakdown
  if (gap <= 5) return 90;    // minimal drop
  if (gap <= 10) return 80;   // moderate drop
  if (gap <= 15) return 65;   // noticeable drop
  // gap 16+: significant drop, linear decrease
  return Math.max(20, 50 - (gap - 16) * 2);
}

// V2: QA flag check for connected speech
export function connectedSpeechQAFlag(wordLevelAccuracy, sentenceLevelAccuracy) {
  if (wordLevelAccuracy === null || sentenceLevelAccuracy === null) return false;
  return (sentenceLevelAccuracy - wordLevelAccuracy) >= 8;
}

// ============================================================
// CLARITY INDICATOR (not in composite)
// correct_word_count / word_count as percentage
// ============================================================
export function scoreClarity(correctWordCount, wordCount) {
  if (!wordCount || wordCount === 0) return null;
  return (correctWordCount / wordCount) * 100;
}

export function getClarityIndicator(clarity) {
  if (clarity >= 90) return { level: "High", message: "High clarity — speech is consistently easy to transcribe" };
  if (clarity >= 75) return { level: "Good", message: "Good clarity — most speech is clearly produced" };
  return {
    level: "Low",
    message: "Low clarity — a significant proportion of speech was unclear. Score may not fully reflect ability.",
    flag: true,
  };
}

// ============================================================
// OVERALL SCORE — V2 weighted composite
// Clarity is NOT included
// ============================================================
const WEIGHTS = {
  phonemeAccuracy: 0.25,
  fluency: 0.22,
  wordStress: 0.18,
  consistency: 0.18,
  connectedSpeech: 0.17,
};

export function calculateOverallScore(dimensions) {
  const { phonemeAccuracy, fluency, wordStress, consistency, connectedSpeech } = dimensions;

  const overall =
    (phonemeAccuracy ?? 0) * WEIGHTS.phonemeAccuracy +
    (fluency ?? 0) * WEIGHTS.fluency +
    (wordStress ?? 0) * WEIGHTS.wordStress +
    (consistency ?? 0) * WEIGHTS.consistency +
    (connectedSpeech ?? 0) * WEIGHTS.connectedSpeech;

  return Math.round(overall * 10) / 10;
}

// ============================================================
// BAND LABELS — listener-focused
// ============================================================
export function getOverallBand(score) {
  if (score >= 90) return { band: "Easy to understand", color: "#16a34a" };
  if (score >= 75) return { band: "Generally clear", color: "#65a30d" };
  if (score >= 60) return { band: "Some effort needed", color: "#ca8a04" };
  if (score >= 45) return { band: "Frequently difficult", color: "#ea580c" };
  return { band: "Very hard to understand", color: "#dc2626" };
}

// ============================================================
// PHONEME WEAKNESS DETECTION
// ============================================================
export function detectPhonemeWeaknesses(wordScoreList) {
  const confusions = {};
  for (const word of wordScoreList) {
    if (!word.phone_score_list) continue;
    for (const phone of word.phone_score_list) {
      if (
        phone.sound_most_like &&
        phone.phone &&
        phone.sound_most_like !== phone.phone &&
        phone.quality_score < 80
      ) {
        if (!confusions[phone.phone]) confusions[phone.phone] = {};
        confusions[phone.phone][phone.sound_most_like] =
          (confusions[phone.phone][phone.sound_most_like] || 0) + 1;
      }
    }
  }

  const weaknesses = [];
  for (const [target, confused] of Object.entries(confusions)) {
    for (const [heard, count] of Object.entries(confused)) {
      weaknesses.push({ target, heard, count });
    }
  }
  return weaknesses.sort((a, b) => b.count - a.count);
}

// ============================================================
// MAIN: Score a full session
// ============================================================
export function scoreSession(speechAceData) {
  const {
    word_score_list,
    word_score_list_words,
    word_score_list_sentences,
    fluency_metrics,
    correct_word_count,
    word_count,
  } = speechAceData;

  // Minimum data check
  if (!meetsMinimumData(word_count, fluency_metrics.duration)) {
    return { tooShort: true, message: "Response too short to score — please try again." };
  }

  const phonemeAccuracy = scorePhonemeAccuracy(word_score_list);
  const fluency = scoreFluency(fluency_metrics);
  const wordStress = scoreWordStress(word_score_list);
  const consistencyResult = scoreConsistency(word_score_list);

  const wordLevelAcc = scorePhonemeAccuracy(word_score_list_words);
  const sentenceLevelAcc = scorePhonemeAccuracy(word_score_list_sentences);
  const connectedSpeech = scoreConnectedSpeech(wordLevelAcc, sentenceLevelAcc);

  const clarity = scoreClarity(correct_word_count, word_count);
  const clarityIndicator = getClarityIndicator(clarity);

  const dimensions = {
    phonemeAccuracy,
    fluency,
    wordStress,
    consistency: consistencyResult.score,
    connectedSpeech,
  };

  const overall = calculateOverallScore(dimensions);
  const band = getOverallBand(overall);
  const weaknesses = detectPhonemeWeaknesses(word_score_list);

  // QA flags
  const qaFlags = [];
  if (connectedSpeechQAFlag(wordLevelAcc, sentenceLevelAcc)) {
    qaFlags.push("Connected Speech QA: sentence accuracy 8+ points above word accuracy");
  }
  if (consistencyResult.flag) {
    qaFlags.push("Consistency QA: item range >= 30 — possible scoring anomaly");
  }

  return {
    tooShort: false,
    overall,
    band,
    dimensions: {
      phonemeAccuracy: { score: Math.round(phonemeAccuracy * 10) / 10, weight: "25%" },
      fluency: { score: Math.round(fluency * 10) / 10, weight: "22%" },
      wordStress: { score: Math.round(wordStress * 10) / 10, weight: "18%" },
      consistency: {
        score: consistencyResult.score,
        weight: "18%",
        sd: consistencyResult.sd,
        range: consistencyResult.range,
      },
      connectedSpeech: { score: Math.round(connectedSpeech * 10) / 10, weight: "17%" },
    },
    clarity,
    clarityIndicator,
    weaknesses,
    qaFlags,
  };
}
