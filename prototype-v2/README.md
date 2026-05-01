# AZE Pronunciation Focus — Prototype v2

A web-based English pronunciation test. One 8–10 minute session, 4 tasks,
scored on 5 dimensions via Azure Speech, with a personalised report at the end.

## Build progress

- [x] **Stage 1** — Scaffold: folder structure, data files, state machine, S0 Welcome, S1 Mic-check
- [x] **Stage 2** — Audio core: AudioWorklet direct PCM capture → WAV utility + debug screen
- [x] **Stage 3** — Tasks 1–4 with Azure wrappers
- [x] **Stage 4** — Scoring engine + results screen + `scoring.test.html` fixtures
- [ ] **Stage 5** — `generate_audio.html` helper

## Tasks 1–4 implementation notes

- **Task 1 (Words)**: 1 fixed practice word (`cat`, w_003, excluded from the 15 scored)
  → 3-2-1 countdown → 15 scored words. Selection is deterministic on `session.seed`:
  11 words with ≤2 syllables + 4 with ≥3, shuffled, with consecutive-same-target_sound
  swapped. Per-word recording window: 3 s (1-syl) / 4 s (2-syl) / 5 s (3+-syl).
  The Hint button reveals IPA + per-syllable stress chart inline; auto-closes after 5 s.
  `hinted: true` is logged per word.
- **Task 2 (Sentences)**: 6 items in fixed progressive order (2 utterances → 2 sentences →
  2 sentence groups). Uniform random within each item type. Two screen states per item:
  reading state (sentence + Ready button) → recording state (sentence + countdown + Stop).
  Max times: 6 / 10 / 18 s by item type.
- **Task 3 (Pairs)**: 8 items, one per contrast (data has 8 unique contrasts). Variant
  (`a`/`b`) randomised per item. Carrier audio is loaded from `audio/<id>_<variant>.mp3`
  if present, else falls back to runtime Azure TTS. Two rounds per item with a hard cap
  of **2 listens total** across both rounds. Round 1 captures `round1_correct`
  (perception); Round 2 PA captures production score against the full carrier sentence.
- **Task 4 (Free production)**: 2 questions (random from 4) + 1 image (random from 4
  Unsplash URLs). 18 s recording cap. Two-step Azure: STT first → use the transcript as
  `referenceText` for PA on the same audio. If transcript is empty, has < 3 words, or
  Azure confidence < 0.3 → flagged as `lowConfidence` and PA is skipped (per the brief).

All Azure calls are kicked off as background promises after each recording; the
**Analysing** screen awaits all of them in parallel before advancing to **Results**.

## Scoring + results (Stage 4)

`scoring.js` is pure compute (no DOM). It takes a session and returns:

- `overall` (composite score) + `band` (one of 5 verdict strings)
- `dimensions` — `{ phoneme, fluency, stress, consistency, sentenceStability }`, all 0–100 or `null`
- `sectionScores` — per-task tile data
- `strengths` — Task 1 words where every phoneme scored ≥ `STRENGTH_PHONEME_MIN` (85)
- `focusAreas` — phoneme groups, sorted by lowest avg, with example words from the session and the tip from `phoneme_tips.json`. Falls back to `target_sound` when Azure phoneme labels are empty (e.g. older session dumps)
- `listening` — Task 3 round-1 perception table data
- `freeSpeech` — `{ state: 'absent' | 'low_confidence' | 'ok', items?, meanPron? }`
- `diagnostics` — counts and intermediate averages, useful for the test page

Tunable constants live at the top of `scoring.js`:

- `SENTENCE_STABILITY_MULTIPLIER = 3` — gap (T1 phoneme avg − T2 phoneme avg) × multiplier → score deduction. NB: this is *not* a measure of true connected-speech features (linking, reductions, weak forms) — that will get a separate dimension when we have data to calibrate it.
- `CONSISTENCY_MULTIPLIER = 3` — Task 1 stdDev × multiplier → score deduction
- `WEIGHTS` — composite weights (phoneme 25, fluency 22, stress 18, consistency 18, sentenceStability 17)
- `FOCUS_THRESHOLD = 80` — phoneme/word score below which it surfaces in "What to work on"
- `STRENGTH_PHONEME_MIN = 85` — every phoneme must clear this for the word to be a strength

If a dimension can't be computed (e.g. no Task 2 data → no Sentence Stability),
the composite re-distributes weights over the dimensions that *are* available
instead of treating null as 0. Missing dimensions render as `—` in the UI.

`results.js` renders the report. Layout matches `report_mockup.html` 1:1.

The report has **two pages** behind a tab switcher:

- **Summary** (default) — hero (with overall + "i" → How modal), 4 section
  tiles, 5 dimension bars (each with its own "i" modal), strengths chips,
  focus areas with per-recording play buttons + lazy TTS model audio,
  listening table, words-vs-sentences compare block, free-speech section,
  session-details card.
- **Detailed analysis** — per-word stress visualisation for every
  multi-syllable Task 1 word, sorted by word accuracy ascending so the most
  actionable rows are at the top. (The accuracy score is used only for
  ordering — it's deliberately *not* rendered in the row, because pairing
  "82" with "wrong stress" reads as a contradiction. The verdict pill is
  the score for this view; overall accuracy still lives on page 1.) Each
  row shows the word + IPA, a syllable-count + expected-stress meta line,
  a flex-grow bar row keyed off `Words[].Syllables[].Duration` (Azure 100ns
  units → seconds), durations underneath, and a verdict pill. A
  template-driven "What you can take from this" summary card sits below.

Hero, How modal, footer, and action buttons live outside the page tabs —
they apply to the whole report. The dim-modal sits inside the summary page
because dim "i" buttons only exist there.

Stress-correctness logic (in `renderDetailPage`):

- The expected stress index = position of `1` in the word-bank's
  `stress_pattern` array.
- The actual stress = the longest syllable.
- **Word-final lengthening compensation**: if the longest syllable is the
  last AND the second-longest matches the expected position, treat the
  second-longest as the actual stress. Stops "electricity" from being
  flagged wrong just because "ty" is naturally longer at end of word.
- Bars are colour-coded: yellow at expected position, blue border at actual
  position, green when both — i.e. correct.
- Words missing `Syllables[]` data (Azure failure) are skipped silently
  rather than rendered as broken rows.

Session-details card renders inside the Summary page, just before the footer.
Modal copy is verbatim from the mockup.

Session-details numbers are computed live from `session` (not from `report`):

- **Words spoken** sums Azure-recognised text per result (PA `text` for T1/2/3,
  STT `transcript` for T4), falling back to the reference text we asked them
  to say if Azure errored or returned blank.
- **Reading rate** (Tasks 1+2+3 Round 2) and **Free rate** (Task 4) are split
  on the same `.split-scores` pattern as the Minimal Pairs tile. Free rate is
  the more useful diagnostic — it's the only task where the learner picks
  their own words. If Task 4 has no usable data, it renders `—` in muted grey.
- **Hints used** is `task1.hintLog.length / 15`.

### Sanity-check the engine

`prototype-v2/scoring.test.html` runs ~30 synthetic fixtures against
`scoring.js` (one targeted test per dimension + edge cases) and prints
pass/fail rows. It also has a file picker to load any `aze-session-*.json`
dump and compare the engine's output to the mockup's target numbers
(within a tolerance per dimension).

```
http://localhost:8000/scoring.test.html
```

## Reproducible runs

Append `?seed=12345` to the URL to fix the random selection across all four tasks.
Stage 3 tasks each derive a sub-seed from this (`seed`, `seed+1`, `seed+2`, `seed+3`)
so they're independent but stable.

## Audio debug screen

Verifies the full capture → 16 kHz mono PCM WAV pipeline before tasks need it.
Reachable from the welcome screen ("Audio debug →") or directly via
`http://localhost:8000/#debug`.

Shows: live level meter, elapsed time, countdown bar, and on completion
duration / file size / sample rate / channels / peak level / source codec, with
in-page playback and a Download WAV link.

## Running locally

This is a static-only app. No build step, no npm.

```bash
# from prototype-v2/
python -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` via `file://` will not work — the data files are loaded
via `fetch()` and browsers block that on the `file:` scheme.

## Setup before first run

1. `cp local-config.example.js local-config.js` (Windows: `copy …`).
2. Open `local-config.js` and fill in `AZURE_KEY` + `AZURE_REGION` from your
   Azure Speech resource (Azure portal → resource → Keys and Endpoint).
3. `local-config.js` is gitignored — the key never enters version control.

The mic-check screen (Stage 1) does **not** call Azure, so you can walk the
flow before pasting the key. Tasks 1–4 will fail with a clear error until the
key is set.

## Folder layout

```
prototype-v2/
├── index.html              SPA shell
├── app.js                  state machine + screen registry + boot
├── audio-utils.js          AudioWorklet PCM capture + WAV encoder
├── azure-speech.js         Azure wrappers (PA / TTS / STT) — reads window.AZE_CONFIG
├── local-config.example.js template for credentials (copy to local-config.js)
├── local-config.js         your real credentials — gitignored, you create this
├── scoring.js              5-dimension engine — pure compute, no DOM
├── results.js              report screen renderer (modals, audio buttons)
├── scoring.test.html       synthetic fixtures + live session loader
├── styles.css              mobile-first, light theme
├── utils.js                seeded RNG, shuffle, escape, IPA helpers
├── tasks/
│   ├── task1-words.js
│   ├── task2-sentences.js
│   ├── task3-pairs.js
│   └── task4-free.js
├── data/
│   ├── word_bank.json           120 words for Task 1
│   ├── sentence_bank.json       120 items (30 utterances + 70 sentences + 20 sentence groups)
│   ├── minimal_pairs.json       24 pairs across 8 contrasts
│   └── phoneme_tips.json        39 ARPABET tips for the report
└── audio/                  pre-generated Task 3 MP3s (populated by generate_audio.html, Stage 5)
```


## Known limitations (prototype scope)

- The Azure key is embedded client-side. **Internal testing only — never ship to real users.**
- No backend persistence. Session JSON is downloadable from the results screen (Stage 4).
- AudioWorklet requires iOS Safari 14.5+ / Chrome 66+ / Firefox 76+. Older browsers will see a clear error on the debug / task screens.
- Word stress score uses `AccuracyScore` on stressed phonemes as a v1 proxy
  (Azure does not return per-phoneme `StressScore`). v2 will switch to Azure's
  word-level `ProsodyScore`.
