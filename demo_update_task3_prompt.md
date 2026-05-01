# Update Prompt — Task 3 v2 (Mixed Perception + Production)

Paste this into Cursor on top of the existing `demo.html`. It changes Task 3 only — keep every other task, screen, and the navy/steel theme exactly as-is. Click-through-only behaviour stays. No microphone, no API.

---

## What's changing

Task 3 currently tests one type of perception (minimal pairs) plus a repeat round. We're widening the perception side to cover three sub-types, and properly tagging the production half so the report can analyse it.

### New Task 3 structure

Three items. Each item has a **receptive round** (listen + identify) and a **production round** (listen again + repeat). The receptive sub-type changes between items.

| Item | Receptive sub-type | Receptive prompt | Production prompt |
|---|---|---|---|
| 1 | Minimal pair (phoneme contrast) | "Which word did you hear?" — `ship` vs `sheep` | Repeat: "The ship arrived early in the morning." |
| 2 | Stress placement | "Which word was stressed differently?" — `PHO-to-graph` vs `pho-TO-graph` | Repeat: "She showed me a photograph of the building." |
| 3 | Intonation | "Was that a statement or a question?" — `Statement` vs `Question` | Repeat: "He's coming to the meeting." (with statement intonation) |

### Receptive UI per item

- Heading: "Listen and choose"
- Sub-type label (small uppercase, `--steel-400`, 0.75rem): "Phoneme contrast" / "Word stress" / "Intonation"
- Big play button in `--accent`. On click, simulate ~3s of "playing" (pause icon, then the play button becomes a "Replay" button — one replay allowed before answering).
- Two large option buttons appear once playback "ends".
- On tap: green flash for correct, red flash for incorrect. Show the correct answer briefly if wrong. Then advance to production round of the same item.
- Mock outcomes for the demo:
  - Item 1 (phoneme): tap **ship**, flash green (correct)
  - Item 2 (stress): tap `pho-TO-graph`, flash red (correct was `PHO-to-graph`)
  - Item 3 (intonation): tap **Statement**, flash green (correct)

### Production UI per item (no change in concept)

- Same look as the existing repeat round.
- Sentence appears, "Tap to record" button → "Stop recording" with pulsing indicator → 6s timeout → next item.

---

## Chip strip — Task 3 instruction screen and persistent strip

Replace the current chips. New chips, primary first:

- `Phoneme Accuracy` (primary)
- `Perception` (primary)
- `Word Stress` (primary — new, because of item 2)
- `Connected Speech` (secondary, muted)

The persistent measurement strip at the bottom of the Task 3 run screen should show the dimension currently being tested for each item. While receptive round is on screen, show: "Measuring · Perception (phoneme / stress / intonation)" matching the active item. While production round is on screen, show: "Measuring · Phoneme · Word Stress · Connected Speech".

---

## Test Map matrix — update Task 3 row

Current Task 3 row shows: `Phoneme` full, `Connected Speech` half, others empty.

Update to:

| Task | Phoneme | Fluency | Stress | Consistency | Connected |
|---|---|---|---|---|---|
| Task 3 — Listen + repeat | full | — | half | — | half |

The footer note about Perception and Prosody being reported separately stays as-is.

---

## Report changes (results screen)

### Hero confidence row

Keep the existing two-card row (Clarity + Perception). The Perception card stays — it's the aggregate.

### New panel — "Perception breakdown"

Add a new small panel directly below the hero confidence row, before the radar chart. Card style same as existing panels (`--navy-800` background, `--navy-600` border).

Title: "Perception breakdown"
Subtext (`--steel-400`, 0.8rem): "From Task 3 — what your ear picked up"

Three rows, each one inline (label · pill · description):

- **Phoneme contrast** · `1/1 correct` · "You hear close phoneme pairs accurately."
- **Word stress** · `0/1 correct` · "Stress shifts can be tricky — practise hearing where the emphasis falls."
- **Intonation** · `1/1 correct` · "You correctly distinguished statements from questions."

Pill style: small rounded pill, `--navy-700` background, JetBrains Mono 12px. Use `--success` text colour for full correct, `--warning` for partial, `--danger` for zero correct.

Aggregate footer line in `--steel-500` 0.75rem: "Aggregate Perception score: 67% (2/3) — shown above."

### What to work on — add a Task 3 perception note

Where the phoneme weakness rows currently show task-source pills (`T1` `T4` `T5` etc.), keep that. **Add one new row at the bottom** of the "What to work on" section, treated visually like a phoneme row but for the perceptual finding:

- Sound icon area shows: "👂 Stress perception" (use a simple text label, no real icon needed — `Stress perception` in Inter 600 is fine)
- Confidence: "Medium confidence"
- Pill: `T3`
- Italic note: "You produce stress patterns reasonably but may not hear them — try ear-training audio drills."

This is the bit that turns the new data into actionable advice. It's the whole point of widening Task 3.

### Strengths section — possible new card

If the demo currently shows three strength cards, swap card 1 for:

- **Sharp ear for sound contrasts** — "You correctly distinguished similar word pairs and intonation patterns." · `Task 3`

(This is mock content tied to the mock outcomes above. Don't auto-generate it from item results — it's a static card for the demo.)

---

## Skip-to-screen dropdown

Update the skip dropdown labels for Task 3:

- "8. Task 3 — Item 1 (phoneme)"
- "9. Task 3 — Item 2 (stress)"
- "10. Task 3 — Item 3 (intonation)"

If the existing dropdown uses a single "Task 3 Run" entry, split it into three so a stakeholder can jump directly to each receptive sub-type.

---

## Out of scope

- All other tasks (1, 2, 4, 5) — do not touch.
- Theme, fonts, or layout primitives.
- The overall results structure beyond what's described above.
- Any real audio — all playback still simulated with setTimeout.

## Deliverable

`demo.html` updated in place. Three Task 3 items playable end-to-end with three different receptive sub-types and the production repeat after each. New Perception breakdown panel and the perceptual weakness row visible on the results screen. No console errors.
