/* azure-speech.js
 *
 * Single Azure Speech resource → three capabilities:
 *   1. Pronunciation Assessment   (Tasks 1, 2, 3, 4)
 *   2. Text-to-Speech             (Task 3 carrier audio fallback, model audio on results)
 *   3. Speech-to-Text             (Task 4 transcript before PA)
 *
 * SECURITY NOTE — prototype only.
 * The key is read from `window.AZE_CONFIG`, populated by `local-config.js` —
 * a gitignored file you create from `local-config.example.js`. The key is
 * still client-side at runtime (it's loaded into the browser), so this is
 * acceptable for an internal prototype but MUST NOT ship to real users. For
 * production, route every Azure call through a thin server that holds the key
 * and proxies the request — see proxy_brief.md.
 */

// =============================================================================
// 1. READ AZURE CREDENTIALS FROM local-config.js
// =============================================================================

const __cfg = (typeof window !== "undefined" && window.AZE_CONFIG) || {};
const AZURE_KEY = __cfg.AZURE_KEY || "6SyJSlI2UxE5RbRGEyj1oDnJCdppCcY63ir0PwRmOdR5sAOQUi5OJQQJ99CEACYeBjFXJ3w3AAAYACOGToIT";
const AZURE_REGION = __cfg.AZURE_REGION || "eastus";

// =============================================================================
// 2. Locale + voice (en-GB throughout for v1)
// =============================================================================

const AZURE_LOCALE = __cfg.AZURE_LOCALE || "en-GB";
const AZURE_TTS_VOICE = __cfg.AZURE_TTS_VOICE || "en-GB-RyanNeural"; // swap to en-GB-SoniaNeural for female

// =============================================================================
// 3. Wrappers
// =============================================================================

(function (global) {
  function assertConfigured() {
    if (!AZURE_KEY || !AZURE_REGION) {
      throw new Error(
        "Azure credentials not set. Copy local-config.example.js to local-config.js and fill in AZURE_KEY and AZURE_REGION."
      );
    }
    if (!global.SpeechSDK) {
      throw new Error(
        "Speech SDK not loaded. Check the <script> tag in index.html."
      );
    }
  }

  function isConfigured() {
    return !!(AZURE_KEY && AZURE_REGION && global.SpeechSDK);
  }

  // The SDK's AudioConfig.fromWavFileInput is typed as File. Wrap our Blob to
  // make sure it's accepted across SDK versions.
  function blobToWavFile(wavBlob, filename) {
    return new File([wavBlob], filename || "audio.wav", { type: "audio/wav" });
  }

  // ---------------------------------------------------------------------------
  // Pronunciation Assessment
  //
  // Returns the parsed JSON detail string, which has shape:
  //   {
  //     RecognitionStatus: "Success" | ...,
  //     DisplayText: "...",
  //     Offset: ..., Duration: ...,
  //     NBest: [{
  //       Confidence, Lexical, ITN, MaskedITN, Display,
  //       PronunciationAssessment: { AccuracyScore, FluencyScore, PronScore, CompletenessScore, ProsodyScore? },
  //       Words: [{
  //         Word, Offset, Duration,
  //         PronunciationAssessment: { AccuracyScore, ErrorType },
  //         Phonemes: [{ Phoneme, Offset, Duration, PronunciationAssessment: { AccuracyScore } }],
  //         Syllables: [...]
  //       }]
  //     }]
  //   }
  //
  // We also return the SDK's high-level result (text, reason) for convenience.
  // ---------------------------------------------------------------------------

  async function scorePronunciation(wavBlob, referenceText, opts = {}) {
    assertConfigured();
    const SDK = global.SpeechSDK;
    const { enableProsody = true } = opts;

    const speechConfig = SDK.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
    speechConfig.speechRecognitionLanguage = AZURE_LOCALE;

    const audioConfig = SDK.AudioConfig.fromWavFileInput(blobToWavFile(wavBlob));
    const recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);

    // Build the PA config via fromJSON. The constructor + property-setter path
    // we used previously left phonemeAlphabet on the JS object but never sent
    // it to the wire — every Phoneme/Syllable string came back empty, which
    // broke the focus-areas grouping. fromJSON serialises the full block as
    // documented and reliably produces populated labels.
    //
    // Using SAPI gives lowercase ARPABET-style codes ("th", "ae", "iy") that
    // match data/phoneme_tips.json keys after .toUpperCase().
    const paJson = {
      referenceText: referenceText,
      gradingSystem: "HundredMark",
      granularity: "Phoneme",
      dimension: "Comprehensive",
      enableMiscue: true,
      phonemeAlphabet: "SAPI",
    };
    if (enableProsody) {
      paJson.enableProsodyAssessment = true;
    }
    const pronunciationConfig = SDK.PronunciationAssessmentConfig.fromJSON(
      JSON.stringify(paJson)
    );

    // Belt-and-braces: also set the property and call the method. fromJSON
    // is the canonical path, but some SDK builds also need the post-hoc
    // assignment to forward the alphabet to the wire format. Cheap to do.
    try { pronunciationConfig.phonemeAlphabet = "SAPI"; } catch (_) {}
    if (enableProsody) {
      if (typeof pronunciationConfig.enableProsodyAssessment === "function") {
        try { pronunciationConfig.enableProsodyAssessment(); } catch (_) {}
      } else if ("enableProsodyAssessment" in pronunciationConfig) {
        try { pronunciationConfig.enableProsodyAssessment = true; } catch (_) {}
      }
    }
    pronunciationConfig.applyTo(recognizer);

    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => {
          try {
            const jsonStr = result.properties.getProperty(
              SDK.PropertyId.SpeechServiceResponse_JsonResult
            );
            const json = jsonStr ? JSON.parse(jsonStr) : null;

            const out = {
              text: result.text || "",
              reason: result.reason,
              reasonName: reasonName(SDK, result.reason),
              json,
              referenceText,
            };
            recognizer.close();
            resolve(out);
          } catch (e) {
            try { recognizer.close(); } catch (_) {}
            reject(e);
          }
        },
        (error) => {
          try { recognizer.close(); } catch (_) {}
          reject(asError(error));
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Speech-to-Text (Task 4)
  // ---------------------------------------------------------------------------

  async function transcribe(wavBlob) {
    assertConfigured();
    const SDK = global.SpeechSDK;

    const speechConfig = SDK.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
    speechConfig.speechRecognitionLanguage = AZURE_LOCALE;
    // Detailed output gives us NBest[].Confidence for the low-confidence skip
    // logic in Task 4. The simple format omits NBest entirely.
    try { speechConfig.outputFormat = SDK.OutputFormat.Detailed; } catch (_) {}

    const audioConfig = SDK.AudioConfig.fromWavFileInput(blobToWavFile(wavBlob));
    const recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => {
          let confidence = null;
          try {
            const jsonStr = result.properties.getProperty(
              SDK.PropertyId.SpeechServiceResponse_JsonResult
            );
            if (jsonStr) {
              const j = JSON.parse(jsonStr);
              if (j && j.NBest && j.NBest[0] && typeof j.NBest[0].Confidence === "number") {
                confidence = j.NBest[0].Confidence;
              }
            }
          } catch (_) {}

          const out = {
            text: result.text || "",
            reason: result.reason,
            reasonName: reasonName(SDK, result.reason),
            confidence,
          };
          recognizer.close();
          resolve(out);
        },
        (error) => {
          try { recognizer.close(); } catch (_) {}
          reject(asError(error));
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Text-to-Speech (Task 3 carriers + results-page model audio)
  // Returns an MP3 Blob. Caller is responsible for caching / URL lifecycle.
  // ---------------------------------------------------------------------------

  async function synthesizeToBlob(text, opts = {}) {
    assertConfigured();
    const SDK = global.SpeechSDK;
    const { voice = AZURE_TTS_VOICE } = opts;

    const speechConfig = SDK.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
    speechConfig.speechSynthesisVoiceName = voice;
    speechConfig.speechSynthesisOutputFormat =
      SDK.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;

    const synthesizer = new SDK.SpeechSynthesizer(speechConfig, null);

    return new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          try {
            if (result.reason === SDK.ResultReason.SynthesizingAudioCompleted) {
              const blob = new Blob([result.audioData], { type: "audio/mp3" });
              synthesizer.close();
              resolve(blob);
            } else {
              const errMsg = result.errorDetails || `TTS reason=${result.reason}`;
              synthesizer.close();
              reject(new Error(errMsg));
            }
          } catch (e) {
            try { synthesizer.close(); } catch (_) {}
            reject(e);
          }
        },
        (error) => {
          try { synthesizer.close(); } catch (_) {}
          reject(asError(error));
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function reasonName(SDK, reason) {
    const map = {};
    if (SDK && SDK.ResultReason) {
      for (const k of Object.keys(SDK.ResultReason)) {
        map[SDK.ResultReason[k]] = k;
      }
    }
    return map[reason] || String(reason);
  }

  function asError(e) {
    if (!e) return new Error("Unknown Azure error");
    if (e instanceof Error) return e;
    if (typeof e === "string") return new Error(e);
    if (e.errorDetails) return new Error(e.errorDetails);
    return new Error(JSON.stringify(e));
  }

  global.AzureSpeech = {
    AZURE_LOCALE,
    AZURE_TTS_VOICE,
    isConfigured,
    scorePronunciation,
    transcribe,
    synthesizeToBlob,
  };
})(window);
