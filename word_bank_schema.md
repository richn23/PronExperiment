# Word Bank Schema — AZE Pronunciation Focus

The word bank is the single source of words for **Task 1** (Read Aloud — Words) and **Task 3** (Listen, Identify and Repeat). One bank, two uses.

This is the v1 schema — minimal fields to start small and grow into.

---

## Fields

| Field              | Type    | Required | Purpose                                                                 | Example                |
| ------------------ | ------- | -------- | ----------------------------------------------------------------------- | ---------------------- |
| `id`               | string  | Yes      | Stable unique identifier                                                | `w_0042`               |
| `word`             | string  | Yes      | The word as displayed to the student                                    | `photograph`           |
| `ipa`              | string  | Yes      | IPA transcription (shown in Hint)                                       | `/ˈfəʊ.tə.ɡrɑːf/`     |
| `syllables`        | integer | Yes      | Number of syllables — used for session balancing                        | `3`                    |
| `stress_pattern`   | array   | Yes      | One number per syllable: `1` = primary stress, `0` = unstressed, `2` = secondary | `[1, 0, 0]`            |
| `target_sound`     | string  | Yes      | The phoneme this word is chosen to target (ARPABET — matches SpeechAce) | `F`                    |
| `cefr_level`       | string  | Yes      | A1 / A2 / B1 / B2 / C1                                                  | `A2`                   |
| `difficulty`       | string  | Yes      | `easy` / `medium` / `hard` — for adaptive selection later               | `medium`               |

---

## Optional fields (add later, when needed)

These are not required for v1 but worth reserving in the schema so you don't have to migrate data later.

| Field              | Type   | Used by             | Notes                                                          |
| ------------------ | ------ | ------------------- | -------------------------------------------------------------- |
| `minimal_pair`     | string | Task 3              | The contrasting word — e.g. `sheep` for `ship`                 |
| `sentence_context` | string | Task 3              | Carrier sentence containing the word (GPT-4o pre-generated)    |
| `phoneme_targets`  | array  | Adaptive practice   | Multiple phonemes a word exercises, beyond the primary target  |
| `notes`            | string | Content team        | Free-text — flagged issues, regional variants, etc.            |

---

## Example records

```json
[
  {
    "id": "w_0001",
    "word": "ship",
    "ipa": "/ʃɪp/",
    "syllables": 1,
    "stress_pattern": [1],
    "target_sound": "IH",
    "cefr_level": "A1",
    "difficulty": "easy"
  },
  {
    "id": "w_0002",
    "word": "think",
    "ipa": "/θɪŋk/",
    "syllables": 1,
    "stress_pattern": [1],
    "target_sound": "TH",
    "cefr_level": "A1",
    "difficulty": "medium"
  },
  {
    "id": "w_0042",
    "word": "photograph",
    "ipa": "/ˈfəʊ.tə.ɡrɑːf/",
    "syllables": 3,
    "stress_pattern": [1, 0, 0],
    "target_sound": "F",
    "cefr_level": "B1",
    "difficulty": "medium"
  }
]
```

---

## Field rules / conventions

**`stress_pattern`**
- Length must equal `syllables`
- Single-syllable words: always `[1]`
- Most multi-syllable words have exactly one `1`. Long words may have a `2` for secondary stress.

**`target_sound`**
- Use ARPABET codes (no slashes, no IPA symbols) — same convention as SpeechAce and the report spec
- Vowels: `IH IY AH AE EH AA AO UW UH OW EY AY OY AW ER`
- Consonants: `P B T D K G F V TH DH S Z SH ZH CH JH M N NG L R W Y HH`

**`difficulty`**
- `easy` — high frequency, regular spelling, single syllable preferred
- `medium` — common but with one tricky element (cluster, less common phoneme)
- `hard` — challenging cluster, common but stress-sensitive, or contains a phoneme known to trouble L2 speakers

**`cefr_level`**
- Use the lowest CEFR level at which the word is typically taught
- Most pronunciation-target words sit in A1–B1; reserve B2/C1 for harder vocabulary

---

## What this enables

- **Task 1 selection logic** — balance by `syllables`, `target_sound`, `difficulty`, `cefr_level`
- **Hint button** — render IPA + stress line from `ipa` and `stress_pattern`
- **Report grouping** — match phonemes from SpeechAce back to `target_sound` so the "What to work on" section shows pattern, not isolated words
- **Future Task 3 wiring** — drop in `minimal_pair` + `sentence_context` later without migrating existing entries

---

## Next steps

1. Lock this schema in
2. Build a starter bank of ~30 words covering each `target_sound` at least once across A1–B1
3. Pilot Task 1 against the starter bank, then expand to the full 200–300 word target
