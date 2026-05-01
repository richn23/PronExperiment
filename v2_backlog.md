# v2 Backlog

Items deferred from the v1 prototype. Each entry is a self-contained spec
fragment — pick up, refine, and slot into a future build brief when the
prerequisites are in place.

---

## Connected Speech (true)

Build a true Connected Speech dimension as a separate measure. Use Azure's
`Prosody.Break.BreakLength`, `Prosody.Break.UnexpectedBreak`, `ProsodyScore`,
and per-phoneme realisation analysis vs expected reduced forms.

This is **distinct from Sentence Stability** — that one measures whether
accuracy survives sentence load; this would measure whether the learner uses
natural English rhythm and reduction features (linking, weak forms,
contractions, schwa reductions, elision).

### Signals to use

- `Prosody.Break.BreakLength` per word — over-long pauses inside a phrase
  signal hesitation rather than natural connected speech.
- `Prosody.Break.UnexpectedBreak` — flags pauses where a fluent speaker would
  link.
- `ProsodyScore` (word-level, available in recent Azure SDK builds — currently
  marked `// TODO: v2 prosody` in `scoring.js`).
- Per-phoneme `AccuracyScore` of expected weak/reduced phonemes (e.g. `/ə/`
  in unstressed function words, dropped `/t/` between consonants) — compared
  against the citation form.

### Open questions

- Reference text needs to encode expected reductions, not just citation
  spelling. Either annotate the sentence bank or run a second PA pass with a
  reduced-form reference and compare.
- Calibration set: build a small corpus of recordings from native speakers and
  from learners who score high on Sentence Stability but flat on rhythm, to
  pick weight thresholds that don't false-positive on careful-but-clear
  speakers.
