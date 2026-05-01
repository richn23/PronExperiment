/* audio-utils.js
 *
 * Direct PCM capture via AudioWorklet — no codec round-trip.
 *
 * Public API (window.AudioUtils):
 *   getMicStream()                                     → Promise<MediaStream>
 *   stopStream(stream)                                 → void
 *   ensureLiveStream(existing)                         → Promise<MediaStream>
 *   createAnalyser(stream, opts)                       → { ctx, analyser, freqBins, timeBins, dispose }
 *   rmsFromTimeDomain(byteBuf)                         → Number (0..~1)
 *
 *   startRecording(stream, opts)                       → { stop, done }
 *      opts:
 *        maxMs              Number   hard cap (ms). Default 10_000.
 *        onLevel(rms)       fn       optional, throttled to ~60 Hz
 *        onTick(elapsedMs)  fn       optional, called every 100 ms
 *      done resolves with:
 *        { wavBlob, durationMs, sampleRate, channels, peak, source: "pcm-worklet" }
 *
 *   encodeWavPcm16(audioBufferLike)                    → Blob (audio/wav)
 *      audioBufferLike: { sampleRate, numberOfChannels, length, getChannelData(c) }
 *
 * Capture pipeline:
 *   MediaStream → MediaStreamSource → AudioWorkletNode → (silenced) destination
 *
 * The worklet runs on the audio thread (immune to main-thread jank), receives
 * 128-sample float32 quanta, downmixes to mono if needed, computes RMS, and
 * posts each quantum back to the main thread via a transferable. The main
 * thread accumulates chunks; on stop we concatenate, encode 16-bit PCM WAV,
 * and resolve. No codec, no decode, no resample.
 *
 * Sample rate = AudioContext native (typically 48000 on Chrome/Edge). Azure
 * Pronunciation Assessment accepts 16/24/48 kHz natively.
 */

(function (global) {
  // ---------------------------------------------------------------------------
  // Mic stream
  // ---------------------------------------------------------------------------

  async function getMicStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("MediaDevices API not available in this browser.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      try { t.stop(); } catch (_) {}
    });
  }

  async function ensureLiveStream(existing) {
    if (existing && existing.getAudioTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    return getMicStream();
  }

  // ---------------------------------------------------------------------------
  // Analyser (used by mic check waveform — independent of recording path)
  // ---------------------------------------------------------------------------

  function createAnalyser(stream, { fftSize = 256 } = {}) {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error("AudioContext not available in this browser.");

    const ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    return {
      ctx,
      analyser,
      freqBins: new Uint8Array(analyser.frequencyBinCount),
      timeBins: new Uint8Array(analyser.fftSize),
      dispose() {
        try { source.disconnect(); } catch (_) {}
        try { analyser.disconnect(); } catch (_) {}
        try { ctx.close(); } catch (_) {}
      },
    };
  }

  function rmsFromTimeDomain(byteBuf) {
    let sum = 0;
    for (let i = 0; i < byteBuf.length; i++) {
      const v = (byteBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / byteBuf.length);
  }

  // ---------------------------------------------------------------------------
  // AudioWorklet processor (loaded once via Blob URL)
  // ---------------------------------------------------------------------------

  const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const numCh = input.length;
    const len = input[0].length; // 128

    // Downmix to mono (or copy if already mono). Must clone — the engine
    // reuses the input buffer between callbacks.
    const mono = new Float32Array(len);
    if (numCh === 1) {
      mono.set(input[0]);
    } else {
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < numCh; c++) s += input[c][i];
        mono[i] = s / numCh;
      }
    }

    // RMS for level meter — same source of truth as the captured PCM.
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += mono[i] * mono[i];
    const rms = Math.sqrt(sumSq / len);

    this.port.postMessage({ chunk: mono, rms }, [mono.buffer]);
    return true;
  }
}
registerProcessor("aze-capture", CaptureProcessor);
`;

  let _workletUrl = null;
  function getWorkletUrl() {
    if (!_workletUrl) {
      _workletUrl = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: "application/javascript" })
      );
    }
    return _workletUrl;
  }

  // ---------------------------------------------------------------------------
  // Recording controller
  // ---------------------------------------------------------------------------

  function startRecording(stream, opts = {}) {
    const { maxMs = 10000, onLevel = null, onTick = null } = opts;

    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error("AudioContext not available in this browser.");
    if (typeof AudioWorkletNode === "undefined") {
      throw new Error("AudioWorklet not supported in this browser.");
    }

    const ctx = new AC();
    const sampleRate = ctx.sampleRate;

    let source = null;
    let node = null;
    let gain = null;
    const chunks = [];
    let totalSamples = 0;
    let peak = 0;
    let lastLevelEmit = 0;
    let stopRequested = false;
    let startTime = 0;
    let tickInterval = 0;
    let maxStopTimer = 0;
    let resolveDone, rejectDone;

    function disconnectGraph() {
      if (tickInterval) { clearInterval(tickInterval); tickInterval = 0; }
      if (maxStopTimer) { clearTimeout(maxStopTimer); maxStopTimer = 0; }
      try { if (source) source.disconnect(); } catch (_) {}
      try { if (node) node.disconnect(); } catch (_) {}
      try { if (gain) gain.disconnect(); } catch (_) {}
    }

    function closeCtx() {
      try { ctx.close(); } catch (_) {}
    }

    async function init() {
      try {
        await ctx.audioWorklet.addModule(getWorkletUrl());
        if (stopRequested) return; // user already cancelled

        source = ctx.createMediaStreamSource(stream);
        node = new AudioWorkletNode(ctx, "aze-capture");
        // Zero-gain sink keeps the worklet in an active audio graph without
        // routing mic input to the speakers (which would feedback).
        gain = ctx.createGain();
        gain.gain.value = 0;
        source.connect(node);
        node.connect(gain);
        gain.connect(ctx.destination);

        node.port.onmessage = (e) => {
          const { chunk, rms } = e.data;
          chunks.push(chunk);
          totalSamples += chunk.length;
          if (rms > peak) peak = rms;

          // Throttle level callback to ~60 Hz (worklet posts at ~375 Hz @ 48k).
          if (onLevel) {
            const now = performance.now();
            if (now - lastLevelEmit >= 16) {
              lastLevelEmit = now;
              try { onLevel(rms); } catch (err) { console.warn(err); }
            }
          }
        };

        startTime = performance.now();

        if (onTick) {
          tickInterval = setInterval(() => {
            try { onTick(performance.now() - startTime); } catch (err) { console.warn(err); }
          }, 100);
        }

        maxStopTimer = setTimeout(() => stop(), maxMs);
      } catch (err) {
        disconnectGraph();
        closeCtx();
        rejectDone(err);
      }
    }

    function stop() {
      if (stopRequested) return;
      stopRequested = true;

      const elapsedMs = startTime ? performance.now() - startTime : 0;
      disconnectGraph();

      if (totalSamples === 0) {
        closeCtx();
        rejectDone(new Error("No audio data captured."));
        return;
      }

      // Concatenate all Float32 chunks into a single buffer.
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (let i = 0; i < chunks.length; i++) {
        merged.set(chunks[i], offset);
        offset += chunks[i].length;
      }

      // Duck-typed AudioBuffer for the WAV encoder.
      const audioBufferLike = {
        sampleRate,
        numberOfChannels: 1,
        length: merged.length,
        getChannelData: () => merged,
      };

      let wavBlob;
      try {
        wavBlob = encodeWavPcm16(audioBufferLike);
      } catch (err) {
        closeCtx();
        rejectDone(err);
        return;
      }

      closeCtx();
      resolveDone({
        wavBlob,
        durationMs: Math.round(elapsedMs),
        sampleRate,
        channels: 1,
        peak,
        source: "pcm-worklet",
      });
    }

    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    init();

    return { stop, done };
  }

  // ---------------------------------------------------------------------------
  // WAV encoder (16-bit PCM, little-endian)
  // ---------------------------------------------------------------------------

  function encodeWavPcm16(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, "WAVE");

    // fmt sub-chunk
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);          // PCM chunk size
    view.setUint16(20, 1, true);           // format = 1 (PCM)
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);          // bits per sample

    // data sub-chunk
    writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = [];
    for (let c = 0; c < numberOfChannels; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numberOfChannels; c++) {
        let s = channelData[c][i];
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  function writeAscii(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  global.AudioUtils = {
    getMicStream,
    stopStream,
    ensureLiveStream,
    createAnalyser,
    rmsFromTimeDomain,
    startRecording,
    encodeWavPcm16,
  };
})(window);
