# Backend Proxy Brief — Hide the Azure key for public sharing
*Queue this after Stage 4 is complete and verified.*

## Why we're doing this

Right now `azure-speech.js` holds `AZURE_KEY` and `AZURE_REGION` as client-side constants. Anyone who opens the deployed site and hits F12 can read the key and use it for their own purposes — burning through the free quota or generating cost on a paid tier.

The fix is a small backend proxy on Vercel. The key lives server-side as an environment variable. The browser never sees it.

## Architecture

Vercel serverless functions live in `/api/` at the project root. Each `.js` file becomes a callable endpoint at `/api/<name>`.

**Folder structure after this change:**

```
prototype-v2/
├── index.html
├── app.js
├── azure-speech.js        ← rewrite this to call /api/* instead of Azure directly
├── scoring.js
├── ...
├── data/
├── audio/
├── tasks/
└── api/                   ← NEW
    ├── speech.js          ← Pronunciation Assessment (Tasks 1, 2, 3, and Task 4 unscripted)
    └── tts.js             ← Text-to-Speech (Task 3 carrier audio)
```

## Environment variables

Set in the Vercel dashboard (Project → Settings → Environment Variables):

```
AZURE_KEY=<the key>
AZURE_REGION=westeurope    (or wherever the resource lives)
```

These are accessible inside serverless functions via `process.env.AZURE_KEY` and `process.env.AZURE_REGION`. Never sent to the browser.

## Endpoint 1 — `/api/speech.js`

**Purpose:** proxy Azure Pronunciation Assessment for all four tasks.

**Request from client:**
```js
POST /api/speech
Content-Type: application/json
Body: {
  audio_base64: "<base64-encoded WAV bytes>",
  reference_text: "ship",     // omit/null for Task 4 unscripted mode
  language: "en-GB"
}
```

**Server logic:**
1. Read `AZURE_KEY` + `AZURE_REGION` from `process.env`
2. Decode base64 audio to a Buffer
3. Build the `Pronunciation-Assessment` config header (base64-encoded JSON):
   - With reference text → reading mode (Tasks 1–3)
   - Without reference text → unscripted/speaking mode (Task 4)
4. POST to Azure Speech REST endpoint (preferred over the SDK in serverless — simpler, no large dependencies):
   ```
   https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1
   ```
5. Return Azure's JSON response unchanged

**Response to client:** the raw Azure JSON (so the existing scoring engine continues to work without changes).

**Implementation hints:**
- Use Node's built-in `fetch` (Vercel runtime supports it)
- Azure's REST API for Pronunciation Assessment is documented at: https://learn.microsoft.com/azure/ai-services/speech-service/rest-speech-to-text-short
- Keep timeout under 10 seconds (Vercel Hobby plan limit)

## Endpoint 2 — `/api/tts.js`

**Purpose:** proxy Azure Text-to-Speech for Task 3 carrier sentence audio.

**Request from client:**
```js
POST /api/tts
Content-Type: application/json
Body: {
  text: "I noticed the ship from the window of the car.",
  voice: "en-GB-RyanNeural"
}
```

**Server logic:**
1. Read `AZURE_KEY` + `AZURE_REGION` from `process.env`
2. Build SSML payload from `text` + `voice`
3. POST to Azure TTS REST endpoint:
   ```
   https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
   ```
4. Set `X-Microsoft-OutputFormat: audio-48khz-192kbitrate-mono-mp3`
5. Return the MP3 bytes directly with `Content-Type: audio/mp3`

**Response to client:** the binary MP3, streamable into an `<audio>` element via `URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }))`.

## Client-side changes — `azure-speech.js`

Rewrite the three wrapper functions:

**Before:**
```js
async function scorePronunciation(audioBlob, referenceText) {
  // direct Azure SDK call with hardcoded key
}
```

**After:**
```js
async function scorePronunciation(audioBlob, referenceText) {
  const audio_base64 = await blobToBase64(audioBlob);
  const res = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64,
      reference_text: referenceText,   // null for Task 4 unscripted
      language: 'en-GB'
    })
  });
  if (!res.ok) throw new Error(`Speech API failed: ${res.status}`);
  return await res.json();
}

async function generateTTS(text, voice = 'en-GB-RyanNeural') {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice })
  });
  if (!res.ok) throw new Error(`TTS API failed: ${res.status}`);
  return await res.blob();   // MP3 blob ready for <audio> playback
}
```

**Remove the Azure SDK CDN script tag from `index.html`** — the proxy approach uses plain `fetch`. Smaller page weight, no SDK dependency.

**Remove** the `AZURE_KEY` and `AZURE_REGION` constants from `azure-speech.js` entirely. Add a comment at the top noting the keys live as environment variables on the deployment.

## Local development

For local testing without deploying every change:

1. Install Vercel CLI: `npm i -g vercel`
2. In `prototype-v2/`, create a `.env.local` file (gitignored):
   ```
   AZURE_KEY=...
   AZURE_REGION=westeurope
   ```
3. Run `vercel dev` — starts a local server that simulates Vercel including the `/api/*` endpoints, reading `.env.local` for env vars
4. Visit `http://localhost:3000` (Vercel CLI's port) — same behaviour as production

`.env.local` should be in `.gitignore`. Add a `.env.example` with the variable names but no values.

## Deploy to Vercel

1. Push `prototype-v2/` to a GitHub repo (or use the CLI: `vercel deploy`)
2. In Vercel dashboard → New Project → Import the repo
3. Set the two environment variables in Settings
4. Deploy. Vercel auto-detects the static site + serverless functions
5. URL: `<project-name>.vercel.app`

## Things to verify after deploy

- Browser inspector shows no `AZURE_KEY` anywhere in source or network requests
- Tasks 1–4 all score correctly via the proxy
- Task 3 carrier audio still loads (now via `/api/tts`)
- Total round-trip latency for a Task 1 word is under 2 seconds
- A failing Azure call returns a useful error, not a 500

## Optional follow-ups (don't build yet)

- **Rate limiting** — protect the proxy from abuse (e.g. someone scripting it). Use Vercel's built-in rate limit middleware or a simple in-memory counter.
- **Logging** — log Azure response times and error rates to spot quota issues early
- **Caching for TTS** — Task 3 carrier sentences are deterministic. Cache the MP3 in Vercel Blob storage or a CDN so repeat requests don't hit Azure
- **Auth** — if you want to gate access (logged-in users only), add a simple JWT check in each endpoint

## Time estimate

For Cursor, this is roughly:
- Endpoint 1 (`/api/speech.js`): 30 mins
- Endpoint 2 (`/api/tts.js`): 15 mins
- Rewrite `azure-speech.js` to use proxy: 20 mins
- Local testing with `vercel dev`: 15 mins
- Vercel deploy + env vars: 10 mins

About 90 minutes total. Done in one sitting.
