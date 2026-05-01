# Build Brief — AZE Pronunciation Focus Prototype
*Hand this to Cursor to build the prototype app. All data files referenced are in this folder.*

---

## What we're building

A web-based English pronunciation test. The learner takes a single 8–10 minute session covering 4 tasks, gets scored on 5 dimensions via Azure Speech, and sees a personalised report at the end.

**Tech stack (keep simple):**
- Plain HTML + CSS + vanilla JS (no React unless Cursor strongly prefers it for the prototype)
- Azure Speech SDK loaded from CDN
- Single-page app with a state machine
- All data loaded from local JSON files
- Mobile-first responsive

**Folder structure to create:**
```
AZE Pron Test/                       ← you're already in this folder
├── word_bank_starter.json           ← 120 words for Task 1 (already built — reference directly)
├── sentence_bank_starter.json       ← 120 items for Task 2 (already built — reference directly)
├── minimal_pairs_bank.json          ← 24 pairs for Task 3 (already built — reference directly)
├── (other spec docs already here)
│
└── prototype-v2/                    ← create this subfolder
    ├── index.html                   ← main app shell + screens
    ├── app.js                       ← state machine, screen rendering
    ├── azure-speech.js              ← Azure API wrapper (3 services)
    ├── scoring.js                   ← maps Azure data → 5 dimension scores
    ├── styles.css                   ← styling
    ├── audio/                       ← pre-generated MP3s for Task 3 carriers
    └── README.md
```

Reference the data files via relative path: `../word_bank_starter.json`, `../sentence_bank_starter.json`, `../minimal_pairs_bank.json`. No need to copy or rename them.

---

## Azure setup (the user will provide these)

A single Azure Cognitive Services — Speech resource gives 3 capabilities:

| Capability | Used by | Endpoint |
|---|---|---|
| Pronunciation Assessment | Tasks 1, 2, 3 (Round 2), 4 | `https://{region}.api.cognitive.microsoft.com/...` |
| Text-to-Speech | Task 3 Round 1 audio (pre-generated) | Same SDK |
| Speech-to-Text | Task 4 (generates the reference transcript) | Same SDK |

Configuration (in `azure-speech.js`):
```js
const AZURE_KEY = 'PASTE_KEY_HERE';      // user fills in
const AZURE_REGION = 'westeurope';        // or whatever they chose
```

Use the official `microsoft-cognitiveservices-speech-sdk` from CDN: `https://aka.ms/csspeech/jsbrowserpackageraw`

---

## The 4 tasks

### Task 1 — Read Aloud (Words)

**Source data:** `data/word_bank.json` (120 words).

**Session selection:** pick 15 words. Balance:
- ~70% one or two syllables
- ~30% three+ syllables
- Spread across phoneme targets (no two consecutive words should share `target_sound`)

**Screen flow:**
1. Instruction screen → "You'll see one word at a time. Tap Hint if you're not sure how to say it."
2. 1 practice word (not scored)
3. 3-2-1 countdown → mic activates
4. **Word loop (15 times):**
   - Show the word large/centred
   - Show small "? Hint" button below
   - Pulsing red recording indicator
   - Auto-advance after ~3s (1-syl) or ~4–5s (multi-syl)

**Hint button behaviour:**
- Tap → show IPA (`ipa` field) + a stress line beneath
- Stress line = thick raised bar under stressed syllable, thin bar under unstressed
- Use `stress_pattern` array: `1` = primary, `0` = unstressed, `2` = secondary
- **Auto-close after 5 seconds**
- Log every hint use (just store `{word_id, hinted: true}` in the session record)

**Stress line example:** for `[1, 0, 0]` (photograph):
```
PHO-to-graph
━━━━ ─── ───
```

**Azure call per word:** Pronunciation Assessment with `referenceText = word.word`, get `Phonemes[]` and `PronunciationAssessment` block back.

---

### Task 2 — Read Aloud (Utterances → Sentences → Sentence groups)

**Source data:** `data/sentence_bank.json` (120 items: 30 utterances, 70 sentences, 20 sentence_groups).

**Session selection:** pick 6 items in this **progressive order**:
- 2 utterances (`item_type === 'utterance'`)
- 2 sentences (`item_type === 'sentence'`)
- 2 sentence groups (`item_type === 'sentence_group'`)

The progression goes word → utterance → sentence → sentence group across Tasks 1 and 2. Don't shuffle the order.

**Screen flow per item:**
1. Sentence appears on screen (multi-line wrap), large centred
2. Single button: **Ready to record**
3. On tap → recording starts immediately, button changes to **Stop**, countdown bar shows remaining time
4. Auto-stop at max time. **No re-record.**

**Recording max times:**
- Utterance: 6 seconds
- Sentence: 10 seconds
- Sentence group: 18 seconds

**Azure call per item:** Pronunciation Assessment with `referenceText = item.text`.

---

### Task 3 — Listen, Identify and Repeat

**Source data:** `data/minimal_pairs.json` (24 pairs across 8 contrasts).

**Session selection:** pick 8 items, one from each of the 8 contrasts. Randomise which word in the pair is the "heard" word (so half are `word_a`, half are `word_b`).

**Pre-generated audio:** TTS each carrier sentence with both `word_a` and `word_b` filling the blank → save as `audio/p_001_a.mp3`, `audio/p_001_b.mp3`, etc. Do this once with a one-time script, not at runtime.

**Screen flow per item:**

**Round 1 — Listen and identify:**
1. Audio plays automatically (the chosen variant)
2. Sentence appears on screen with the **target word blanked out**:
   ```
   "I noticed the ______ from the window of the car."
   ```
3. Two choice buttons appear below: `[ ship ]  [ sheep ]` (randomise left/right)
4. Replay button available (1 extra listen, before answering)
5. Tap a choice → green flash if correct, red flash if wrong
6. **The chosen word fills the blank** with the flash colour
7. Brief pause (~1s) → Round 2

**Round 2 — Listen and repeat:**
1. The **correct** word fills the blank (so they have the right model in front of them)
2. Audio plays again automatically (max 2 listens total across both rounds)
3. Instruction: "Now repeat the full sentence clearly."
4. Record button → recording starts → 8-second timer → auto-stop
5. Auto-advance to next item

**Azure call:** Pronunciation Assessment with `referenceText = full carrier sentence (with the correct word filled in)`. Score the target phoneme specifically when calculating Phoneme Accuracy.

**Diagnostic tracking:** record both `round1_correct: true/false` and the Round 2 score. The combination is what's diagnostically valuable (perception vs production).

---

### Task 4 — Free Production

**Prompts (hardcode for v1, expand later into a bank):**

Question prompts (use 2 of these per session):
- "What did you do yesterday?"
- "Do you prefer studying in the morning or evening? Why?"
- "Describe the room you are in right now."
- "Tell me about your favourite meal."

Image prompt (use 1 of these per session):
- Pick from a small set of culturally-neutral images (3–5 elements each). For prototype, link to placeholder images. Suggested topics: *people in a park*, *kitchen scene with cooking*, *street market with fruit*, *office with desks*.

**Screen flow per prompt:**
1. Prompt displayed (or image shown)
2. Single button: **Start recording**
3. Recording starts → 18-second timer → **Stop** button or auto-stop
4. Auto-advance

**Azure calls (two-step):**
1. Speech-to-Text on the recording → get transcript
2. Pronunciation Assessment with `referenceText = transcript` and the same audio

If the ASR transcript is empty or confidence is very low, flag the response and skip scoring rather than penalise.

---

## Scoring engine (`scoring.js`)

After all 4 tasks, calculate the 5 dimensions from the collected Azure data.

**Dimension formulas:**

```js
// 1. Phoneme Accuracy (25%) — average of all phoneme accuracy scores across the session
phonemeAccuracy = mean(allPhonemes.map(p => p.AccuracyScore));

// 2. Fluency (22%) — average of FluencyScore from sentence-level items only (Tasks 2 + 4)
fluency = mean(sentenceLevelItems.map(item => item.FluencyScore));

// 3. Word Stress (18%) — average stress_score across stress-bearing phonemes
//    (Azure returns this differently to SpeechAce — check field name)
wordStress = mean(stressedPhonemes.map(p => p.StressScore || p.AccuracyScore));

// 4. Connected Speech (17%) — gap between Task 1 and Task 2 phoneme accuracy
const t1Avg = mean(task1Items.map(i => i.itemPhonemeAvg));
const t2Avg = mean(task2Items.map(i => i.itemPhonemeAvg));
const gap = t1Avg - t2Avg;
// Map gap to score: 0 gap or negative = 100, larger gap = lower score
connectedSpeech = gap <= 0 ? 100 : Math.max(0, 100 - gap * 3);

// 5. Consistency (18%) — standard deviation of item-level phoneme accuracy from Task 1
const stdDev = standardDeviation(task1Items.map(i => i.itemPhonemeAvg));
// Map: low stdDev = high consistency. e.g. stdDev of 0 → 100, stdDev of 25 → 25
consistency = Math.max(0, 100 - stdDev * 3);

// Composite
overall = (phonemeAccuracy * 0.25)
        + (fluency * 0.22)
        + (wordStress * 0.18)
        + (consistency * 0.18)
        + (connectedSpeech * 0.17);

// Clarity indicator (separate from composite)
clarity = (correctWordCount / totalWordCount) * 100;
```

**Score bands for the overall verdict:**
- 85–100: "Clear and confident"
- 70–84: "Generally clear with some patterns to refine"
- 55–69: "Comprehensible but inconsistent"
- 40–54: "Listener has to work to follow"
- Below 40: "Difficult for a listener to follow"

---

## Results screen

Four sections, in order:

1. **Overall verdict** — band label + score (e.g. "Generally clear — 76") + an optional warm paragraph (Cursor: leave a placeholder for an LLM call later, don't worry about it for v1)

2. **Words you pronounced clearly** — list the Task 1 words where every phoneme scored above 85. Display the word + a small "Play your recording" button.

3. **What to work on** — phonemes where average score < 70, **grouped by phoneme code**. For each:
   - Header: `TH — as in "think"`
   - List of words from the session that contained this phoneme below threshold
   - Their recording button + a model recording button (use TTS to generate model audio if needed)
   - One pre-written tip per phoneme (Cursor: add a small lookup table — e.g. `TH: "Place the tip of your tongue between your teeth and blow air gently."`)

4. **Phoneme chart** — a static visual of all English phonemes with the struggled ones highlighted. For prototype, can be a simple grid.

---

## Azure SDK usage examples

### Pronunciation Assessment (Tasks 1, 2, 3)

```js
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

async function scorePronunciation(audioBlob, referenceText) {
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
  speechConfig.speechRecognitionLanguage = "en-GB";

  const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(audioBlob);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true  // enable miscue
  );
  pronunciationConfig.applyTo(recognizer);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      result => {
        const json = JSON.parse(result.properties.getProperty(
          SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
        ));
        resolve(json);  // contains NBest[0].PronunciationAssessment + Words[].Phonemes[]
      },
      error => reject(error)
    );
  });
}
```

### Text-to-Speech (one-time pre-generation for Task 3)

Build a small `generate_audio.html` that loops through `minimal_pairs.json`, calls TTS for each carrier with `word_a` and `word_b` filled in, and downloads the MP3s. Run once, then copy the audio files into `audio/`.

```js
async function generateTTS(text, filename) {
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
  speechConfig.speechSynthesisVoiceName = "en-GB-RyanNeural";  // pick one consistent voice
  speechConfig.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;

  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);
  return new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(text, result => {
      // Save result.audioData as MP3
      const blob = new Blob([result.audioData], { type: "audio/mp3" });
      // ... download or save logic
      resolve(blob);
    }, reject);
  });
}
```

### Speech-to-Text (Task 4 only)

```js
async function transcribe(audioBlob) {
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
  speechConfig.speechRecognitionLanguage = "en-GB";
  const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(audioBlob);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      result => resolve(result.text),
      error => reject(error)
    );
  });
}
```

---

## Audio recording (browser, no API needed)

Use the browser MediaRecorder API:

```js
let mediaRecorder, chunks = [];

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  chunks = [];
  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.start();
}

function stopRecording() {
  return new Promise(resolve => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
    mediaRecorder.stop();
  });
}
```

Note: Azure Pronunciation Assessment expects **WAV** format. You'll need a small browser-side conversion from webm → wav before sending. Use [recorderjs](https://github.com/mattdiamond/Recorderjs) or convert via Web Audio API.

---

## Build order recommended

1. **Day 1 — Scaffolding**
   - Create folder structure, copy data files
   - Build the state machine + welcome/mic-check screens
   - Get audio recording working end-to-end (record → playback in console)

2. **Day 2 — Task 1**
   - Build word screen + hint button + countdown
   - Wire up Azure Pronunciation Assessment for one word
   - Loop through 15 words, collect responses

3. **Day 3 — Task 2 + Task 3**
   - Task 2: same recording flow, longer items, ready-to-record gate
   - Task 3: pre-generate audio, build the listen/identify/repeat flow

4. **Day 4 — Task 4 + Scoring + Report**
   - Task 4: ASR → reference text → score
   - Implement scoring engine
   - Build results screen

5. **Day 5 — Polish**
   - Style, transitions, error handling, edge cases (no mic permission, network fail, etc.)

---

## Things to leave for later (don't build now)

- LLM-generated verdict paragraph (Section 1 of report) — placeholder text is fine
- Adaptive difficulty (drawing from `difficulty` field)
- Session history / repeated sessions
- Authentication
- Backend storage — for prototype, store session data in localStorage or just download as JSON
- Voice activity detection (auto-stop on silence)

---

## Done means

- A user can complete a full 4-task session in 8–10 minutes
- All recordings are scored via Azure
- They see a results screen with a score, the 5 dimensions, and a "what to work on" list
- The whole prototype runs from a static folder served via any local web server (e.g. `python -m http.server`)
