# Update Prompt — Pronunciation Test Demo v2

Paste this into Cursor on top of your existing `demo.html` project. It updates two things:

1. **Tags each task with what it's measuring** so the design intent is visible during the walkthrough.
2. **Strengthens the results report** with five concrete upgrades.

Keep the existing navy + steel theme, Inter / JetBrains Mono fonts, and click-through-only behaviour from v1. Do not break any existing screens.

---

## Part 1 — Task tagging

The goal: a stakeholder watching the demo should be able to see, on every task, *what it's measuring* and *which part of the final report it feeds*. Right now the link is invisible.

### 1.1 Add a global "Test Map" screen

Insert a new screen between Welcome (screen 1) and Mic Check (screen 2). Call it **"Test Map"**. Title: "What this test measures".

Show a simple 5×5 matrix:

- Rows: the 5 tasks (Words, Sentences, Listen+Repeat, Free Production, Watch & Summarise)
- Columns: the 5 scoring dimensions (Phoneme Accuracy, Fluency, Word Stress, Consistency, Connected Speech)
- Cells: filled circle in `--accent` for primary signal, half-filled in `--steel-400` for secondary signal, empty for not measured.

Mapping data (use exactly this):

```
                     Phoneme  Fluency  Stress  Consistency  Connected
Task 1 — Words        full    -        full    full         -
Task 2 — Sentences    half    full     -       half         full
Task 3 — Listen+Rep   full    -        -       -            half
Task 4 — Free Prod    half    full     -       full         half
Task 5 — Watch+Sum    half    full     -       full         full
```

Below the matrix add a one-line legend: "● primary signal · ◐ secondary signal".

Bottom CTA: "Continue".

### 1.2 Add a "What this measures" chip strip on every task instruction screen

Each task instruction screen (3, 5, 7, 9, 11) currently has heading + body + CTA. Add a horizontal row of small chips above the body, one chip per dimension that task measures. Style:

- Chip background: `--navy-700`
- Chip border: 1px solid `--navy-600`
- Text: `--steel-200`, Inter 500, 0.75rem, uppercase, tracking 0.08em
- Padding: 6px 12px, radius 999px (pill shape)
- Primary signals: chip background `--accent-soft`, text `--accent`
- Secondary signals: keep neutral styling

Apply this mapping (primary chips listed first):

- **Task 1**: `Phoneme Accuracy` `Word Stress` `Consistency`
- **Task 2**: `Connected Speech` `Fluency` `Phoneme Accuracy`
- **Task 3**: `Phoneme Accuracy` `Perception` `Connected Speech`
- **Task 4**: `Fluency` `Consistency` `Phoneme Accuracy` `Connected Speech`
- **Task 5**: `Fluency` `Connected Speech` `Consistency` `Prosody`

(Note: "Perception" and "Prosody" are new tags — they're shown to the learner but treated separately in the report, not folded into the composite.)

### 1.3 Add a persistent measurement indicator during each task

While a task is in progress, show a tiny fixed strip at the bottom of the screen:

- Text: "Measuring: " followed by the primary chips for that task (smaller — 0.7rem, no background, just the dimension names separated by middle dots ·)
- Position: fixed bottom, centred, 24px from bottom, `--steel-400` text
- Don't show during instruction screens or transitions — only while items are being read/recorded

---

## Part 2 — Results report upgrades

Replace the current results screen (screen 14) with this expanded structure. Same dark navy theme. The order matters — top of page first.

### 2.1 Section A — Overall verdict (existing, minor update)

Keep the existing hero number and band label (e.g. "78 — Generally clear"). Add **two confidence indicators side by side** below the score, replacing the single Clarity row:

- **Clarity 82%** — "Most of your speech was clearly transcribed"
- **Perception 80%** — "You correctly identified 4 of 5 minimal pairs"

Style as two equal-width pill cards in `--navy-700`, separated by 16px. Each card has the percentage in JetBrains Mono 24px and a single-line label in `--steel-400` below.

### 2.2 Section B — Performance by task (NEW)

This is the biggest change. Insert a new section directly after the radar chart, titled **"How you performed by task"**.

Render a horizontal bar chart, one bar per task, showing phoneme accuracy:

```
Task 1 — Words           ████████████████████░░  88
Task 2 — Sentences       ████████████████░░░░░░  76
Task 3 — Listen + Repeat █████████████████░░░░░  79
Task 4 — Free production ████████████░░░░░░░░░░  64
Task 5 — Watch + Summary ███████████░░░░░░░░░░░  61
```

Visual spec:
- Bar fill: gradient from `--accent` to `--accent-soft`
- Track: `--navy-700`
- Bar height: 12px, radius 6px
- Score label right-aligned in JetBrains Mono 16px
- Task label left-aligned in Inter 500 14px
- Above the chart, a thin annotation: a brace under bars 1–3 labelled "Reading from script" and a brace under bars 4–5 labelled "Speaking freely". Use 1px lines in `--steel-500` and labels in 0.7rem.
- Below the chart, a one-line GPT-style commentary in `--steel-200`: "Your pronunciation drops about 20 points when you're not reading from a script — this is the gap to focus on."

This is the single most important new visual — make it prominent.

### 2.3 Section C — Your strengths (replaces "Words you pronounced clearly")

Instead of listing words that scored well, show **3 strength cards** describing what the learner did well in plain language. Each card has:

- Header (Inter 600, 18px) — e.g. "Vowel length is solid"
- Body (Inter 400, 14px, `--steel-200`) — one sentence describing the pattern
- Evidence pill (small, `--navy-700` background) — e.g. "Seen in 14 words"

Mock content:

1. **Strong vowel length contrast** — "You consistently distinguish long and short vowels (sit/seat, ship/sheep)." · *Seen in 14 words*
2. **Natural sentence rhythm** — "When reading sentences, your pacing and stress feel close to native rhythm." · *Tasks 2 and 5*
3. **Confident voiced consonants** — "Sounds like /v/, /z/, and /dʒ/ are produced clearly throughout the test." · *Seen in 22 phonemes*

### 2.4 Section D — What to work on (existing, with task tagging)

Keep the phoneme group structure. **Add task-source pills** next to each phoneme group. After the phoneme code and example word, show small task pills indicating where the issue appeared.

Mock data update:

- **/θ/ → /t/** — High confidence · pills: `T1` `T4` `T5`
- **/v/ → /b/** — Medium confidence · pills: `T1` `T2`
- **/ɪ/ → /iː/** — Medium confidence · pills: `T1` `T3`

Pill style: 24px circle, `--navy-700` background, `--steel-400` text, Inter 600 11px, centred. Spacing: 4px between pills.

Below each phoneme row, add an italic one-line note:

- For /θ/: "Appears across all task types — make this your top focus."
- For /v/: "Mostly in controlled tasks — practise in connected speech."
- For /ɪ/: "Both perception and production — try ear-training first."

### 2.5 Section E — Speech under load (NEW, from Task 5)

A small panel titled **"Speech under load"** with three numeric readouts in JetBrains Mono. Layout: three equal columns inside a single card.

Mock values:

- **Speaking rate** · `132 words/min` · subtext "Comfortable for listeners"
- **Average pause** · `0.8s` · subtext "Natural"
- **Longest run** · `4.2s` · subtext "Strong continuous speech"

Style: column dividers in `--navy-600` (1px), each value 22px JetBrains Mono in `--steel-100`, label in `--steel-400` 0.75rem uppercase, subtext in `--steel-500` 0.8rem.

Below the panel, one explanatory line: "Measured during Task 5 — your longest sample of natural speech."

### 2.6 Section F — Your advice (existing, no change to logic)

Keep the existing GPT-style advice paragraph. Mock content stays.

### 2.7 Footer

Keep the "Restart demo" CTA. Add a secondary CTA next to it: "Download report (PDF)" — clicking does nothing in the demo, just shows a brief "PDF generation not built in demo" toast that fades after 2 seconds.

---

## Part 3 — Visual cleanup

A few small things to tighten while you're in there:

- **Section dividers in the report.** Between each section A–F, add a thin 1px divider line in `--navy-600` with 48px vertical spacing. Currently sections may run into each other.
- **Section labels.** Above each section heading, add a small uppercase label in `--steel-400` 0.7rem tracking 0.1em — e.g. "Section 02 · Performance by task". This is purely visual hierarchy.
- **Top-of-results sticky bar.** When the results page is scrolled past the hero, a slim sticky bar appears at the top showing the overall score and band label, plus a "back to top" link on the right. Background `--navy-800` with 1px border-bottom in `--navy-600`.

---

## Out of scope (do not change)

- The first 13 screens (welcome through analysing) — only the new "Test Map" screen and the chip strip on instruction screens.
- The chart library — keep using inline SVG.
- The skip-to-screen dev dropdown.
- Audio, microphone, API behaviour — still all simulated.
- Single-file structure — everything still in `demo.html`.

---

## Deliverable

Update `demo.html` in place. The file should still run by double-clicking, with all original screens intact plus the new Test Map screen, task chips, persistent measurement strip, and the upgraded results page (sections A–F). No console errors.
