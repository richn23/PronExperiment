# Build Prompt — Pronunciation Test Click-Through Demo (LatAm v1)

Paste this into Cursor or Claude Code. It is self-contained — no other files need to be opened.

---

## What to build

A **click-through visual demo** of a 5-task pronunciation test for the Latin American market. This is **not a working test** — no microphone access, no audio recording, no API calls, no real scoring. Every interactive control simply advances the user to the next screen or simulates a state change.

The goal is to walk a stakeholder through the full learner journey so they can sign off on the design before any real engineering happens.

## Tech constraints

- **Single self-contained HTML file** named `demo.html`. All CSS and JavaScript inline. No build step, no npm packages.
- Vanilla JavaScript only. No React, no frameworks.
- Use Google Fonts via a `<link>` tag in the `<head>` — Inter (400, 500, 600, 700) for body/UI and JetBrains Mono (500) for any timer or numeric readouts.
- Must run by double-clicking the file. No local server required.
- Mobile-friendly down to 375px wide. Desktop layout from 768px up.

## Visual design

### Theme: Navy & Steel

The current prototype is dark/black. Replace with a navy + steel-grey palette. Modern, calm, professional — closer to a banking or analytics app than a consumer game.

**Colour tokens** (use as CSS variables):

```
--navy-900: #0A1628    /* page background */
--navy-800: #0F1E33    /* card background */
--navy-700: #1B2A41    /* elevated surfaces */
--navy-600: #2A3D5C    /* borders, dividers */
--steel-500: #5C7393   /* secondary text */
--steel-400: #7A91B0   /* muted text, icons */
--steel-200: #B8C5D6   /* primary text on dark */
--steel-100: #E0E6EF   /* high-contrast text, headings */
--accent: #4FB3D9      /* primary CTA, recording active, focus rings */
--accent-soft: #4FB3D920  /* glow / hover backgrounds */
--success: #5DD4A0
--warning: #F2B84B
--danger: #E87B7B
```

### Typography

- Headings: Inter 600, tight tracking (-0.02em on h1/h2)
- Body: Inter 400, 16px base, line-height 1.6
- UI labels / small caps: Inter 500, 0.75rem, uppercase, tracking 0.08em, colour `--steel-400`
- Timers and numeric readouts: JetBrains Mono 500
- Words being read aloud (Task 1): Inter 600, 64px on desktop, 48px on mobile, centred

### Layout

- Page max-width 880px, centred, with generous vertical padding.
- Cards: `--navy-800` background, 16px radius, 1px border in `--navy-600`, soft shadow (`0 8px 32px rgba(0,0,0,0.3)`).
- Primary buttons: `--accent` background, navy-900 text, 12px radius, 14px vertical padding, 32px horizontal, Inter 600. Hover lifts 1px and brightens.
- Secondary buttons: transparent, 1px border in `--steel-500`, `--steel-100` text.
- Animations: subtle. 200ms transitions on hover. Use ease-out. Don't bounce.

### Recording indicator

When "recording" is active, show a pulsing dot in `--accent` (1.5s ease-in-out infinite) next to the word "Recording" in Inter 500 small caps. No real recording happens — the dot is purely visual.

### Progress

Top of every task screen: a thin progress bar showing **task X of 5** (not item-level). For time-based tasks (1, 2), show a second slim bar underneath counting down the task timer.

## Screen flow

The demo must include these screens in this order. Every "next" / "start" / "record" / "stop" / option-tap advances state.

### 1. Welcome
- Logo placeholder (just text: "Pronunciation Focus" in Inter 700, 32px)
- Subtitle: "Latin America Edition · ~15 minutes"
- Bullet list of the 5 tasks with one-line descriptions each
- Primary CTA: "Begin"

### 2. Mic Check (fake)
- Heading: "Quick mic check"
- A circular animated waveform placeholder (just CSS — three pulsing concentric circles in `--accent`)
- Helper text: "Say something — we just want to check your microphone."
- After ~2 seconds of "listening", show a green check and a "Looks good" message.
- CTA: "Continue"

### 3. Task 1 instructions
- Heading: "Task 1 of 5 — Read aloud"
- Body: "You'll see words on screen. Read each one clearly. The task lasts 3 minutes — read as many as you can."
- Two-line bullet list of dos/don'ts.
- CTA: "I'm ready"

### 4. Task 1 in progress
- Top: progress bar showing 1/5 task progress + 3-minute countdown timer (mm:ss in JetBrains Mono).
- Centre: a single word, very large.
- Below word: small "Recording" indicator with pulsing dot.
- The demo cycles through this list of 8 sample words on a 4-second auto-advance:
  `enthusiasm`, `vegetable`, `comfortable`, `important`, `developed`, `photograph`, `available`, `temperature`
- After the 8th word, jump to Task 2 instructions.
- (In a real test there would be 25–30 words; 8 is enough to convey the experience.)

### 5. Task 2 instructions
- Heading: "Task 2 of 5 — Read aloud sentences"
- Body: "Read each sentence aloud at your natural pace. Tap **Ready** when you've understood it, then read."
- CTA: "I'm ready"

### 6. Task 2 in progress
- Sentence card showing the sentence in 24px Inter 500.
- Below: "Ready to record" button. On click, the button transforms into a "Stop recording" button and the recording indicator appears.
- On stop click (or after 8 seconds auto), show next sentence.
- Cycle through 4 sentences of progressive difficulty:
  1. "The bus arrives at nine in the morning."
  2. "She doesn't usually have time for breakfast."
  3. "He thought the photographs were taken last Thursday."
  4. "If I'd known about the meeting earlier, I would have prepared properly."
- After the 4th, advance to Task 3.

### 7. Task 3 instructions
- Heading: "Task 3 of 5 — Listen, identify, repeat"
- Body: "You'll hear a sentence. Tap the word you heard, then read the sentence aloud."
- CTA: "I'm ready"

### 8. Task 3 in progress (per item, 3 items in demo)
Two-stage screen:

**Stage A — Listen & identify**
- "Tap play to listen" → play button (▶ in `--accent`).
- After play is clicked, simulate 3 seconds of "playing" (button shows pause icon, then becomes a replay button).
- Two large option buttons appear side by side: e.g. `ship` and `sheep`.
- On tap: option flashes green or red briefly. Use this pattern for the 3 items:
  - ship / sheep → tap **ship**, flash green
  - bit / beat → tap **bit**, flash red, show correct
  - live / leave → tap **live**, flash green
- After flash, advance to Stage B.

**Stage B — Listen & repeat**
- Sentence shown: "The {chosen word} arrived early."
- "Tap to record" button.
- On click, transforms into "Stop recording" with pulsing indicator.
- On stop (or 6s timeout), advance to next item.

After 3 items, go to Task 4.

### 9. Task 4 instructions
- Heading: "Task 4 of 5 — Free production"
- Body: "Answer the prompts in your own words. Speak for as long as feels natural."
- CTA: "I'm ready"

### 10. Task 4 in progress
- Show prompt in 22px Inter 500 inside a card.
- "Tap to record" button → "Stop recording" with pulsing indicator.
- 3 prompts in sequence:
  1. "Tell me about your typical morning."
  2. "Describe the place where you grew up."
  3. "What's something you'd like to learn this year?"
- After all 3, advance to Task 5.

### 11. Task 5 instructions
- Heading: "Task 5 of 5 — Watch and summarise"
- Body: "You'll watch a short video, then summarise what you saw in your own words."
- CTA: "I'm ready"

### 12. Task 5 in progress (2 videos)
- Video placeholder: 16:9 black rectangle with `--navy-700` border and a play button overlay. No real video — just a static placeholder showing "Video 1 of 2" inside.
- On play click, simulate 4 seconds of "playing" (placeholder dims, a small "PLAYING" label appears in `--accent`).
- After "playback ends", show the prompt: "Now summarise what you saw."
- "Tap to record" → "Stop recording" pattern, same as Task 4.
- Repeat for video 2.
- After both, go to Analysing screen.

### 13. Analysing
- Centred animated spinner (CSS only — a rotating arc in `--accent`).
- Heading: "Analysing your pronunciation..."
- Subtext that cycles through three messages every 1.2s: "Processing audio…", "Scoring phonemes…", "Building your report…"
- After ~4 seconds total, advance to results.

### 14. Results
- Heading: "Your pronunciation report"
- Hero number: a large overall score (e.g. 78) with a label "Generally clear"
- A simple radar chart drawn in inline SVG with 5 axes labelled: Phoneme Accuracy, Fluency, Word Stress, Consistency, Connected Speech. Use `--accent` for the polygon fill at 25% opacity, `--accent` stroke. Use mock values: 80, 72, 75, 82, 70.
- Below the radar, a row of 5 dimension cards, each showing the score, the dimension name, and a one-line description.
- A "Phoneme weaknesses" section — a small table with 3 rows, each showing target sound, what it sounded like, and confidence. Mock data:
  - /θ/ → /t/ — High confidence
  - /v/ → /b/ — Medium confidence
  - /ɪ/ → /iː/ — Medium confidence
- Footer CTA: "Restart demo" — clicking returns to Welcome.

## Behaviour rules

- All "recording" controls are visual-only. Never actually request microphone permission.
- All audio playback is simulated with a setTimeout. No real audio files.
- Use sessionStorage **only** for keeping demo state across reload — do not require it.
- Keep all screens in the same HTML file. Switch between them by toggling a `data-screen` attribute on the body or by show/hide on top-level sections.
- Add a tiny dev-only "skip to screen" dropdown fixed in the top-right corner so a stakeholder can jump directly to any screen during the walkthrough. Style it minimally.

## Out of scope (do not build)

- Real microphone capture
- Real speech recognition or scoring
- Backend, API calls, or fetch requests
- User accounts, login, or persistence beyond sessionStorage
- Any real video files
- Mobile native gestures beyond standard tap

## Deliverable

A single file `demo.html` saved at the root of the project. It should run by double-clicking and walk through all 14 screens described above with no errors in the console.
