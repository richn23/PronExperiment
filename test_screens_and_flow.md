# AZE Pronunciation Focus — Test Screens & Flow
*For use in Claude design briefs.*

---

## Overall flow

The test runs as four tasks back-to-back, then a results screen. Total time ~8–10 minutes.

```
Welcome → Mic check → Task 1 → Task 2 → Task 3 → Task 4 → Analysing → Results
```

The student does not see task numbers or names. Transitions are framed as "next part" so it feels like one continuous activity.

---

## Pre-test screens

### S0 — Welcome
- Title: "Pronunciation Check"
- Short line: "We'll listen to how you speak and give you a personalised report. Takes about 8 minutes."
- Single button: **Start**

### S1 — Mic check
- Animated waveform that responds to the user's voice
- Line: "Say something so we know your microphone works."
- Auto-advances when speech is detected for ~1 second
- Button: **Sounds good — continue**

---

## Task 1 — Read Aloud (Words)

**What it tests:** how clearly the student produces individual sounds, one word at a time.

### S1.0 — Instruction
- "You'll see one word at a time. Say each word clearly."
- Small note: "Tap the **Hint** button if you're not sure how to say a word."
- Button: **Start**

### S1.1 — Practice (1–2 words, not scored)
- Same UI as the real task
- Small banner: "Practice — this one doesn't count."

### S1.2 — Countdown
- 3 · 2 · 1
- No word shown yet
- Mic activates at the end of the countdown

### S1.3 — Word screen *(repeats 15–18 times)*

**Layout (top to bottom):**
1. Progress dots: `● ● ● ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○`
2. **Target word** — large, centred, dominant on screen
3. **Hint button** — small, below the word, labelled `? Hint`
4. **Recording indicator** — pulsing red dot + "Recording…" text
5. Auto-advance timer (subtle, e.g. thin bar that depletes)

**Hint behaviour:**
- Tap **Hint** → reveals IPA transcription + stress line directly under the word
- Stress line: thick raised bar over the stressed syllable, thin bar under unstressed syllables
- Auto-closes after **5 seconds**
- Hint use is logged per word (not shown to student)

**Hint open state — example:**
```
photograph

/ˈfəʊ.tə.ɡrɑːf/
━━━━━  ───  ───
 PHO    to   graph
```

**Timing:** ~3s for short words, ~4–5s for longer words. Auto-advance, no re-record.

### S1.4 — Transition
- "Great. Now let's try some sentences."
- Auto-advance after 1.5s

---

## Task 2 — Read Aloud (Sentences)

**What it tests:** how pronunciation holds up when sounds connect in natural speech.

### S2.0 — Instruction
- "You'll see a sentence. Read it silently first, then tap **Ready** and read it aloud."

### S2.1 — Sentence screen *(repeats 4–6 times)*

**Two states on the same screen:**

**State A — Reading state (before recording):**
- Progress dots
- Sentence displayed large, centred, multi-line wrap
- Single primary button: **Ready to record**

**State B — Recording state (after tapping Ready):**
- Same sentence still visible
- **Recording indicator** — pulsing red dot
- Countdown bar showing remaining time (max 10s)
- Secondary button: **Stop**

No re-record. Auto-advance to the next sentence on stop or timeout.

### S2.2 — Transition
- "Nice. Next, you'll listen and repeat."

---

## Task 3 — Listen, Identify and Repeat

**What it tests:** can the student *hear* a sound difference and can they *produce* it.

Each item has two rounds. 8 items total.

### S3.0 — Instruction
- "You'll hear a sentence. Choose the word you heard, then repeat the sentence."

### S3.1 — Round 1: Listen and identify

- Progress dots
- Headline: "Listen carefully"
- Audio plays automatically once
- **Replay button** (one extra listen allowed before answering)
- Two large word-choice buttons appear after audio finishes:

```
   [   ship   ]    [   sheep   ]
```

- Tap one → flash green (correct) or red (incorrect), correct answer revealed if wrong
- Brief pause (~1s), auto-advance to Round 2

### S3.2 — Round 2: Listen and repeat

- Same sentence plays again automatically
- Replay available (max 2 listens total across both rounds)
- Instruction: "Now repeat the full sentence clearly."
- **Record button** — large, central
- Recording indicator + 8s timer once recording starts
- **Stop** button or auto-stop at 8s
- Auto-advance to next item

### S3.3 — Transition
- "Almost done. One more part."

---

## Task 4 — Free Production

**What it tests:** how the student sounds when they choose their own words.

3 prompts: 2 questions + 1 image description.

### S4.0 — Instruction
- "You'll answer two short questions and describe a picture. Speak in full sentences."

### S4.1 — Question prompt *(2 of these)*

- Progress dots
- Question displayed large, centred
- Example: *"What did you do yesterday?"*
- Single primary button: **Start recording**
- After tap → Recording indicator + 15–20s timer + **Stop** button

### S4.2 — Image prompt *(1 of these)*

- Image displayed (3–5 identifiable elements, culturally neutral)
- Instruction below: *"Describe what you can see in this picture."*
- Same record/stop flow as questions
- Image stays visible while recording

### S4.3 — Transition
- "Great — analysing your pronunciation…"

---

## Post-test screens

### S5 — Analysing
- Loading state (~5–10s while SpeechAce/Azure scoring runs)
- Friendly progress messages: "Listening to your sounds…", "Checking your stress patterns…", "Building your report…"

### S6 — Results / Student report

Four sections in this order:

1. **Overall verdict** — score band + warm GPT-4o paragraph
2. **Words you pronounced clearly** — words where every phoneme scored above 85
3. **What to work on** — phonemes scoring below 70, grouped by ARPABET code, each with: example word, student's recording, model recording, plain-English production tip
4. **Interactive phoneme chart** — full English phoneme set, struggled phonemes highlighted

---

## Cross-screen UI rules

- **Progress dots** appear on every task screen so the student knows where they are within a task
- **No re-record** anywhere — every attempt counts (prevents practice/score inflation)
- **One primary action per screen** — never make the student choose between buttons
- **Recording indicator** is always the same: pulsing red dot + "Recording…" — consistent across all four tasks
- **Mic icon** never serves as a button (it's a status indicator only)
- **Mobile-first** — designs should target phone width; desktop is a wider variant of the same layout
