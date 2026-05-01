# AZE Pron Test

A web-based English pronunciation test prototype. Captures four short tasks
(read-aloud words, read-aloud sentences, minimal-pair perception + production,
and a free-speech response), routes the audio through Azure Speech
Pronunciation Assessment, and renders a personalised report scoring five
dimensions: phoneme accuracy, fluency, word stress, consistency, and sentence
stability.

## Where the code lives

The active prototype is in [`prototype-v2/`](./prototype-v2/). Start there —
its [README](./prototype-v2/README.md) covers the architecture, build progress,
how to run it locally, and how to interpret a session dump.

## Setup

1. Clone the repo
2. `cd prototype-v2`
3. `cp local-config.example.js local-config.js`
4. Open `local-config.js` and paste your Azure Speech `AZURE_KEY` and
   `AZURE_REGION`. Get them from the Azure portal — create a Speech resource
   (free F0 tier is fine) and grab Key 1 + the region from the resource's
   "Keys and Endpoint" page.
5. Serve the folder over HTTP (microphone access requires it):
   ```sh
   npx serve -p 8000
   ```
6. Open <http://localhost:8000/>.

`local-config.js` is gitignored — your key never enters version control.

## Project layout

- `prototype-v2/` — the active prototype (vanilla HTML/CSS/JS SPA).
- `prototype/` — earlier scratch build, kept for reference. Don't lift code
  from it; the v2 specs supersede it.
- `build_brief.md`, `test_screens_and_flow.md`, `report_mockup.html`,
  `proxy_brief.md`, `v2_backlog.md` — design docs and specs.
- `*_starter.json`, `phoneme_tips.json`, `minimal_pairs_bank.json` —
  source data files (also copied into `prototype-v2/data/` so that folder is
  self-contained).

## Status

Stages 1–4 are complete (audio capture, four scored tasks with Azure
integration, scoring engine, results report with Summary + Detailed-analysis
pages). Stage 5 (Task 3 carrier-MP3 generator helper) is queued.

## Production note

The current build embeds the Azure key in the browser via `local-config.js`.
That's fine for an internal prototype but is not safe to ship — see
[`proxy_brief.md`](./proxy_brief.md) for the planned server-side proxy
migration.
