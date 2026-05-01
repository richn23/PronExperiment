// Mock SpeechAce API response data for testing
// Based on the sample fields shown in the scoring spec appendix

// Helper: generate a phoneme entry
function phone(phoneme, qualityScore, soundMostLike, stressScore, stressLevel, predictedStress) {
  const entry = { phone: phoneme, quality_score: qualityScore, sound_most_like: soundMostLike || phoneme };
  if (stressScore !== undefined) {
    entry.stress_score = stressScore;
    entry.stress_level = stressLevel;
    entry.predicted_stress_level = predictedStress;
  }
  return entry;
}

// ── STUDENT A: Strong speaker (overall ~82) ──────────────────
export const studentA = {
  name: "Student A — Strong Speaker",
  word_score_list: [
    { word: "have", quality_score: 89, phone_score_list: [
      phone("hh", 85, "hh"), phone("ae", 92.5, "ae", 100, 1, 1), phone("v", 98, "v")
    ]},
    { word: "beautiful", quality_score: 91, phone_score_list: [
      phone("b", 95, "b"), phone("y", 88, "y"), phone("uw", 93, "uw", 95, 1, 1),
      phone("t", 90, "t"), phone("ah", 87, "ah"), phone("f", 92, "f"),
      phone("ah", 85, "ah"), phone("l", 94, "l")
    ]},
    { word: "thinking", quality_score: 85, phone_score_list: [
      phone("th", 78, "t"), phone("ih", 90, "ih", 100, 1, 1), phone("ng", 88, "ng"),
      phone("k", 92, "k"), phone("ih", 86, "ih"), phone("ng", 91, "ng")
    ]},
    { word: "photograph", quality_score: 88, phone_score_list: [
      phone("f", 91, "f"), phone("ow", 85, "ow"), phone("t", 93, "t"),
      phone("ah", 82, "ah", 90, 1, 1), phone("g", 89, "g"),
      phone("r", 87, "r"), phone("ae", 90, "ae"), phone("f", 94, "f")
    ]},
    { word: "comfortable", quality_score: 83, phone_score_list: [
      phone("k", 90, "k"), phone("ah", 85, "ah", 88, 1, 1), phone("m", 92, "m"),
      phone("f", 88, "f"), phone("er", 80, "er"), phone("t", 86, "t"),
      phone("ah", 78, "ah"), phone("b", 91, "b"), phone("ah", 82, "ah"), phone("l", 89, "l")
    ]},
    { word: "environment", quality_score: 86, phone_score_list: [
      phone("ih", 84, "ih"), phone("n", 91, "n"), phone("v", 88, "v"),
      phone("ay", 83, "ay", 92, 1, 1), phone("r", 86, "r"), phone("ah", 80, "ah"),
      phone("n", 90, "n"), phone("m", 87, "m"), phone("ah", 82, "ah"),
      phone("n", 89, "n"), phone("t", 93, "t")
    ]},
  ],
  // Word-only items
  word_score_list_words: [
    { word: "have", phone_score_list: [
      phone("hh", 85, "hh"), phone("ae", 92.5, "ae"), phone("v", 98, "v")
    ]},
    { word: "beautiful", phone_score_list: [
      phone("b", 95, "b"), phone("y", 88, "y"), phone("uw", 93, "uw"),
      phone("t", 90, "t"), phone("ah", 87, "ah"), phone("f", 92, "f"),
      phone("ah", 85, "ah"), phone("l", 94, "l")
    ]},
    { word: "photograph", phone_score_list: [
      phone("f", 91, "f"), phone("ow", 85, "ow"), phone("t", 93, "t"),
      phone("ah", 82, "ah"), phone("g", 89, "g"),
      phone("r", 87, "r"), phone("ae", 90, "ae"), phone("f", 94, "f")
    ]},
  ],
  // Sentence items (slightly lower accuracy for connected speech)
  word_score_list_sentences: [
    { word: "thinking", phone_score_list: [
      phone("th", 72, "t"), phone("ih", 85, "ih"), phone("ng", 82, "ng"),
      phone("k", 88, "k"), phone("ih", 80, "ih"), phone("ng", 86, "ng")
    ]},
    { word: "comfortable", phone_score_list: [
      phone("k", 85, "k"), phone("ah", 80, "ah"), phone("m", 88, "m"),
      phone("f", 82, "f"), phone("er", 75, "er"), phone("t", 80, "t"),
      phone("ah", 72, "ah"), phone("b", 86, "b"), phone("ah", 76, "ah"), phone("l", 83, "l")
    ]},
    { word: "environment", phone_score_list: [
      phone("ih", 78, "ih"), phone("n", 85, "n"), phone("v", 82, "v"),
      phone("ay", 77, "ay"), phone("r", 80, "r"), phone("ah", 74, "ah"),
      phone("n", 84, "n"), phone("m", 81, "m"), phone("ah", 76, "ah"),
      phone("n", 83, "n"), phone("t", 87, "t")
    ]},
  ],
  fluency_metrics: {
    speechace_fluency_score: 78,
    mean_length_run: 3.8,
    all_pause_duration: 12.5,
    duration: 66.97,
    speech_rate: 3.09,
  },
  correct_word_count: 120,
  word_count: 135,
};

// ── STUDENT B: Developing speaker (overall ~58) ────────────
export const studentB = {
  name: "Student B — Developing Speaker",
  word_score_list: [
    { word: "have", quality_score: 65, phone_score_list: [
      phone("hh", 45, "t"), phone("ae", 72, "eh", 60, 1, 0), phone("v", 78, "b")
    ]},
    { word: "think", quality_score: 55, phone_score_list: [
      phone("th", 30, "s"), phone("ih", 68, "ih", 70, 1, 1), phone("ng", 62, "n"),
      phone("k", 75, "k")
    ]},
    { word: "world", quality_score: 60, phone_score_list: [
      phone("w", 72, "w"), phone("er", 48, "or"), phone("l", 65, "l"), phone("d", 70, "d")
    ]},
    { word: "comfortable", quality_score: 52, phone_score_list: [
      phone("k", 70, "k"), phone("ah", 55, "ow", 45, 1, 0), phone("m", 72, "m"),
      phone("f", 60, "p"), phone("er", 42, "ar"), phone("t", 68, "t"),
      phone("ah", 50, "ow"), phone("b", 65, "b"), phone("ah", 48, "ow"), phone("l", 62, "l")
    ]},
    { word: "important", quality_score: 58, phone_score_list: [
      phone("ih", 62, "ih"), phone("m", 70, "m"), phone("p", 65, "b"),
      phone("ao", 55, "ah", 50, 1, 0), phone("r", 52, "l"),
      phone("t", 72, "t"), phone("ah", 58, "ah"), phone("n", 68, "n"), phone("t", 74, "t")
    ]},
    { word: "beautiful", quality_score: 62, phone_score_list: [
      phone("b", 75, "b"), phone("y", 58, "y"), phone("uw", 65, "oo", 55, 1, 0),
      phone("t", 70, "t"), phone("ah", 52, "ah"), phone("f", 60, "p"),
      phone("ah", 48, "ah"), phone("l", 68, "l")
    ]},
  ],
  word_score_list_words: [
    { word: "have", phone_score_list: [
      phone("hh", 52, "t"), phone("ae", 75, "eh"), phone("v", 82, "b")
    ]},
    { word: "think", phone_score_list: [
      phone("th", 35, "s"), phone("ih", 72, "ih"), phone("ng", 68, "n"), phone("k", 78, "k")
    ]},
    { word: "world", phone_score_list: [
      phone("w", 78, "w"), phone("er", 55, "or"), phone("l", 70, "l"), phone("d", 75, "d")
    ]},
  ],
  word_score_list_sentences: [
    { word: "comfortable", phone_score_list: [
      phone("k", 62, "k"), phone("ah", 45, "ow"), phone("m", 65, "m"),
      phone("f", 50, "p"), phone("er", 35, "ar"), phone("t", 60, "t"),
      phone("ah", 40, "ow"), phone("b", 58, "b"), phone("ah", 38, "ow"), phone("l", 55, "l")
    ]},
    { word: "important", phone_score_list: [
      phone("ih", 52, "ih"), phone("m", 62, "m"), phone("p", 55, "b"),
      phone("ao", 45, "ah"), phone("r", 42, "l"),
      phone("t", 65, "t"), phone("ah", 48, "ah"), phone("n", 60, "n"), phone("t", 68, "t")
    ]},
    { word: "beautiful", phone_score_list: [
      phone("b", 68, "b"), phone("y", 48, "y"), phone("uw", 55, "oo"),
      phone("t", 62, "t"), phone("ah", 42, "ah"), phone("f", 50, "p"),
      phone("ah", 38, "ah"), phone("l", 60, "l")
    ]},
  ],
  fluency_metrics: {
    speechace_fluency_score: 48,
    mean_length_run: 1.8,
    all_pause_duration: 28.5,
    duration: 72.0,
    speech_rate: 1.6,
  },
  correct_word_count: 85,
  word_count: 140,
};

// ── STUDENT C: Mid-range speaker (overall ~70) ────────────
export const studentC = {
  name: "Student C — Mid-range Speaker",
  word_score_list: [
    { word: "available", quality_score: 78, phone_score_list: [
      phone("ah", 75, "ah"), phone("v", 82, "v"), phone("ey", 78, "ey", 85, 1, 1),
      phone("l", 80, "l"), phone("ah", 72, "ah"), phone("b", 85, "b"),
      phone("ah", 70, "ah"), phone("l", 82, "l")
    ]},
    { word: "temperature", quality_score: 72, phone_score_list: [
      phone("t", 80, "t"), phone("eh", 74, "eh", 78, 1, 1), phone("m", 82, "m"),
      phone("p", 76, "p"), phone("er", 68, "er"), phone("ah", 70, "ah"),
      phone("ch", 72, "ch"), phone("er", 65, "ar")
    ]},
    { word: "development", quality_score: 75, phone_score_list: [
      phone("d", 80, "d"), phone("ih", 72, "ih"), phone("v", 78, "v"),
      phone("eh", 74, "eh", 80, 1, 1), phone("l", 82, "l"), phone("ah", 70, "ah"),
      phone("p", 76, "p"), phone("m", 80, "m"), phone("ah", 68, "ah"),
      phone("n", 78, "n"), phone("t", 84, "t")
    ]},
    { word: "situation", quality_score: 70, phone_score_list: [
      phone("s", 78, "s"), phone("ih", 72, "ih"), phone("ch", 68, "sh"),
      phone("uw", 74, "uw", 75, 1, 1), phone("ey", 76, "ey"),
      phone("sh", 70, "sh"), phone("ah", 66, "ah"), phone("n", 80, "n")
    ]},
    { word: "opportunity", quality_score: 73, phone_score_list: [
      phone("aa", 72, "ah"), phone("p", 78, "p"), phone("er", 68, "er"),
      phone("t", 80, "t"), phone("uw", 74, "uw", 82, 1, 1), phone("n", 78, "n"),
      phone("ah", 70, "ah"), phone("t", 82, "t"), phone("iy", 76, "iy")
    ]},
  ],
  word_score_list_words: [
    { word: "available", phone_score_list: [
      phone("ah", 80, "ah"), phone("v", 86, "v"), phone("ey", 82, "ey"),
      phone("l", 84, "l"), phone("ah", 78, "ah"), phone("b", 88, "b"),
      phone("ah", 76, "ah"), phone("l", 85, "l")
    ]},
    { word: "temperature", phone_score_list: [
      phone("t", 84, "t"), phone("eh", 78, "eh"), phone("m", 86, "m"),
      phone("p", 80, "p"), phone("er", 74, "er"), phone("ah", 76, "ah"),
      phone("ch", 78, "ch"), phone("er", 72, "ar")
    ]},
  ],
  word_score_list_sentences: [
    { word: "development", phone_score_list: [
      phone("d", 72, "d"), phone("ih", 64, "ih"), phone("v", 70, "v"),
      phone("eh", 66, "eh"), phone("l", 74, "l"), phone("ah", 62, "ah"),
      phone("p", 68, "p"), phone("m", 72, "m"), phone("ah", 60, "ah"),
      phone("n", 70, "n"), phone("t", 76, "t")
    ]},
    { word: "situation", phone_score_list: [
      phone("s", 70, "s"), phone("ih", 64, "ih"), phone("ch", 58, "sh"),
      phone("uw", 66, "uw"), phone("ey", 68, "ey"),
      phone("sh", 62, "sh"), phone("ah", 58, "ah"), phone("n", 72, "n")
    ]},
    { word: "opportunity", phone_score_list: [
      phone("aa", 64, "ah"), phone("p", 70, "p"), phone("er", 60, "er"),
      phone("t", 72, "t"), phone("uw", 66, "uw"), phone("n", 70, "n"),
      phone("ah", 62, "ah"), phone("t", 74, "t"), phone("iy", 68, "iy")
    ]},
  ],
  fluency_metrics: {
    speechace_fluency_score: 65,
    mean_length_run: 2.8,
    all_pause_duration: 18.0,
    duration: 65.0,
    speech_rate: 2.4,
  },
  correct_word_count: 105,
  word_count: 130,
};

export const allStudents = [studentA, studentB, studentC];
