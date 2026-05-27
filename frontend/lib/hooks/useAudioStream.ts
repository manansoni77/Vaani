"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAD_SILENCE_THRESHOLD = 100; // avg magnitude of voice-band bins below this = silence
const VAD_SILENCE_DEBOUNCE_MS = 400; // ms user must be silent before state flips
const TTS_SAMPLE_RATE = 16000; // PCM sample rate for both mic send and TTS receive (bulbul:v3)
/**
 * Minimum average absolute Int16 magnitude (0–32767) for an incoming PCM
 * chunk to count as "voice".  Muted senders produce true zeros; a speaking
 * caller typically reaches thousands.  300 is well above quantisation noise
 * but low enough to catch soft speech.
 */
const INCOMING_VAD_THRESHOLD = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the average byte-magnitude of frequency bins that fall in the
 * 85–255 Hz voice-fundamental band.  Computed against the raw FFT output
 * from AnalyserNode.getByteFrequencyData().
 */
function voiceBandAvg(
  bins: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number,
): number {
  const binHz = sampleRate / fftSize;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < bins.length; i++) {
    const freq = i * binHz;
    if (freq >= 85 && freq <= 255) {
      sum += bins[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AudioStreamStatus =
  | "idle"         // not connected, not attempting
  | "connecting"   // getUserMedia + worklet load + WS handshake in flight
  | "active"       // WS open, mic running
  | "disconnected" // cleanly closed (local or remote)
  | "error";       // mic denied, worklet load fail, unsupported browser

/**
 * Direction of audio activity on the channel:
 *  - "outgoing" — local VAD detected the local mic speaking
 *  - "incoming" — binary audio is being received and played from the server
 *  - "silent"   — neither
 *
 * Pages map these to their own labels (e.g. call page: outgoing→"User", incoming→"Agent";
 * admin takeover: outgoing→"Human Agent", incoming→"User").
 */
export type SpeakerState = "silent" | "outgoing" | "incoming";

export interface UseAudioStreamOptions {
  /**
   * When true, insert a GainNode mute gate between the mic source and the
   * encoder/analyser.  toggleMute() sets gain to 0 or 1 — the server
   * receives silence frames rather than a disconnection.
   * @default false
   */
  enableMute?: boolean;

  /**
   * When true, all queued TTS AudioBufferSourceNodes are stopped the moment
   * auto-VAD detects the user started speaking (barge-in / interruption).
   * Only relevant for the call page.
   * @default false
   */
  enableBargeIn?: boolean;

  /**
   * Minimum seconds ahead of AudioContext.currentTime that a new TTS chunk
   * is scheduled when no prior chunk is queued.
   *
   * Why this exists: AudioContext.currentTime advances continuously.  When
   * the first chunk of a new utterance arrives, scheduling it at exactly
   * ctx.currentTime risks a tiny underrun if the scheduler is already past
   * that timestamp.  A small lookahead ensures clean playback starts.
   *
   *   0     — schedule at ctx.currentTime (fine for steady streams)
   *   0.05  — schedule 50 ms in the future; prevents glitches at utterance
   *           starts where the first chunk may arrive slightly late
   *
   * @default 0.00
   */
  ttsLookaheadSeconds?: number;

  /**
   * Called for every incoming text WebSocket frame that is valid JSON.
   * The hook does not interpret the message — callers handle sessionId, etc.
   */
  onServerMessage?: (msg: Record<string, unknown>) => void;

  /**
   * Called for every loggable event inside the hook (connection steps,
   * errors, disconnects).  The hook itself holds no log state.
   */
  onLog?: (message: string) => void;
}

export interface UseAudioStreamReturn {
  /** Current connection and audio lifecycle status. */
  status: AudioStreamStatus;
  /** Active speaker.  Driven by automatic frequency-bin VAD. */
  speaker: SpeakerState;
  /** Whether the mic is currently muted.  Always false if enableMute is false. */
  muted: boolean;
  /** Open the WebSocket and start the audio pipeline. */
  connect: (url: string) => void;
  /** Tear down the audio pipeline and close the WebSocket. */
  disconnect: () => void;
  /**
   * Toggle microphone mute.  No-op if enableMute is false.
   * Returns the new muted state.
   */
  toggleMute: () => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioStream(options: UseAudioStreamOptions): UseAudioStreamReturn {
  const {
    enableMute = false,
    enableBargeIn = false,
    ttsLookaheadSeconds = 0.00,
  } = options;

  // ------------------------------------------------------------------
  // React state (triggers re-renders)
  // ------------------------------------------------------------------
  const [status, setStatus] = useState<AudioStreamStatus>("idle");
  const [speaker, setSpeaker] = useState<SpeakerState>("silent");
  const [muted, setMuted] = useState(false);

  // ------------------------------------------------------------------
  // Stable refs for callbacks — updated each render so WS handlers
  // always call the latest version without requiring reconnection.
  // ------------------------------------------------------------------
  const onServerMessageRef = useRef(options.onServerMessage);
  const onLogRef = useRef(options.onLog);
  useEffect(() => { onServerMessageRef.current = options.onServerMessage; });
  useEffect(() => { onLogRef.current = options.onLog; });

  // ------------------------------------------------------------------
  // Audio / WebSocket refs (never trigger re-renders)
  // ------------------------------------------------------------------
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBinsRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // TTS / incoming-audio playback
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const agentPlayingRef = useRef(false);

  // Outgoing VAD state (local mic)
  const prevSpeakingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Incoming VAD state (remote party) — mirrors the outgoing VAD debounce
  // so that a muted caller whose PCM frames contain only zeros eventually
  // transitions the badge to "silent" instead of staying on "incoming".
  const prevIncomingVoiceRef = useRef(false);
  const incomingSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lifecycle
  const closingRef = useRef(false);

  // Mute mirror — lets the GainNode update run from event handlers
  // without capturing a stale closure over the `muted` state value.
  const muteRef = useRef(false);

  // ------------------------------------------------------------------
  // Internal: teardown
  // ------------------------------------------------------------------
  const teardownAudioGraph = useCallback(() => {
    workletRef.current?.disconnect();
    workletRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    muteGainRef.current?.disconnect();
    muteGainRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    freqBinsRef.current = null;
  }, []);

  const stopAgentAudio = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    activeSourcesRef.current.clear();
    nextPlayTimeRef.current = 0;
    agentPlayingRef.current = false;
    // Clear incoming-voice debounce so barge-in doesn't leave a stale timer.
    if (incomingSilenceTimerRef.current) {
      clearTimeout(incomingSilenceTimerRef.current);
      incomingSilenceTimerRef.current = null;
    }
    prevIncomingVoiceRef.current = false;
  }, []);

  // ------------------------------------------------------------------
  // Internal: TTS playback
  // Declared BEFORE connect so connect's closure can reference it safely.
  // ------------------------------------------------------------------
  const playPcmChunk = useCallback((data: ArrayBuffer) => {
    if (data.byteLength === 0) return;
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") return;

    const int16 = new Int16Array(data);
    const float32 = new Float32Array(int16.length);

    // Measure average absolute amplitude to distinguish real voice from the
    // silence frames a muted caller still sends (zeros from their GainNode).
    let magnitudeSum = 0;
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
      magnitudeSum += Math.abs(int16[i]);
    }
    const hasIncomingVoice =
      int16.length > 0 &&
      magnitudeSum / int16.length > INCOMING_VAD_THRESHOLD;

    const buffer = ctx.createBuffer(1, float32.length, TTS_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(
      ctx.currentTime + ttsLookaheadSeconds,
      nextPlayTimeRef.current,
    );
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    if (enableBargeIn) {
      activeSourcesRef.current.add(source);
    }

    agentPlayingRef.current = true;

    // ---- Incoming VAD debounce (mirrors the outgoing-mic VAD logic) ----
    if (hasIncomingVoice) {
      // Remote party is speaking — cancel any pending silence debounce.
      if (incomingSilenceTimerRef.current) {
        clearTimeout(incomingSilenceTimerRef.current);
        incomingSilenceTimerRef.current = null;
      }
      if (!prevIncomingVoiceRef.current) {
        prevIncomingVoiceRef.current = true;
        // Only flip badge to "incoming" when local mic is also quiet.
        if (!prevSpeakingRef.current) {
          setSpeaker("incoming");
        }
      }
    } else if (prevIncomingVoiceRef.current && !incomingSilenceTimerRef.current) {
      // Remote party just went silent — debounce before declaring silence,
      // matching the 400 ms debounce used for the outgoing VAD.
      incomingSilenceTimerRef.current = setTimeout(() => {
        incomingSilenceTimerRef.current = null;
        prevIncomingVoiceRef.current = false;
        if (!prevSpeakingRef.current) {
          setSpeaker("silent");
        }
      }, VAD_SILENCE_DEBOUNCE_MS);
    }

    source.onended = () => {
      if (enableBargeIn) {
        activeSourcesRef.current.delete(source);
      }
      // If no more audio is scheduled within 50ms, consider playback done.
      if (nextPlayTimeRef.current <= ctx.currentTime + 0.05) {
        agentPlayingRef.current = false;
        // Audio fully drained — also clear the incoming voice state so it
        // doesn't keep the badge on "incoming" after playback stops.
        prevIncomingVoiceRef.current = false;
        if (incomingSilenceTimerRef.current) {
          clearTimeout(incomingSilenceTimerRef.current);
          incomingSilenceTimerRef.current = null;
        }
        setSpeaker(prevSpeakingRef.current ? "outgoing" : "silent");
      }
    };
  }, [enableBargeIn, ttsLookaheadSeconds]);

  // ------------------------------------------------------------------
  // connect
  // ------------------------------------------------------------------
  const connect = useCallback(
    (url: string) => {
      // If a connection is already live, tear it down first.
      if (wsRef.current) {
        closingRef.current = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        teardownAudioGraph();
        wsRef.current.close();
        wsRef.current = null;
      }

      // Close the old AudioContext to avoid leaking it on reconnect.
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      // Reset all state.
      closingRef.current = false;
      nextPlayTimeRef.current = 0;
      activeSourcesRef.current.clear();
      agentPlayingRef.current = false;
      prevSpeakingRef.current = false;
      prevIncomingVoiceRef.current = false;
      if (incomingSilenceTimerRef.current) {
        clearTimeout(incomingSilenceTimerRef.current);
        incomingSilenceTimerRef.current = null;
      }
      muteRef.current = false;

      setStatus("connecting");
      setSpeaker("silent");
      setMuted(false);

      // Kick off the async setup in a void-wrapped IIFE so connect()
      // stays synchronous (no returned promise to the caller).
      void (async () => {
        // 1. Start getUserMedia as a promise — do NOT await yet.
        //    Opening the WebSocket in parallel means the server can start
        //    forwarding audio the moment the connection is established, rather
        //    than waiting for mic-permission to resolve first.
        const streamPromise = navigator.mediaDevices
          .getUserMedia({ audio: true, video: false })
          .catch(() => null as MediaStream | null);

        // 2. Open WebSocket immediately.
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        // 3. WebSocket event handlers
        ws.onerror = () => {
          onLogRef.current?.("WebSocket error.");
        };

        ws.onclose = () => {
          teardownAudioGraph();
          if (!closingRef.current) {
            onLogRef.current?.("Disconnected from server.");
            setStatus("disconnected");
            setSpeaker("silent");
          }
        };

        ws.onmessage = (e) => {
          if (typeof e.data === "string") {
            try {
              const msg = JSON.parse(e.data) as Record<string, unknown>;
              onServerMessageRef.current?.(msg);
            } catch {
              onLogRef.current?.(`Server message: ${e.data}`);
            }
          } else if (e.data instanceof ArrayBuffer) {
            playPcmChunk(e.data);
          }
        };

        // 4. Audio setup inside onopen — guarantees a user-gesture context
        //    for AudioContext creation (browser requirement).
        ws.onopen = () => {
          void (async () => {
            if (closingRef.current) {
              ws.close();
              return;
            }

            // Create AudioContext before any await so that playPcmChunk can
            // play incoming binary frames as soon as the first one arrives.
            const ctx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
            audioCtxRef.current = ctx;
            ctx.resume().catch(() => {});

            // Browser capability guard
            if (!ctx.audioWorklet) {
              onLogRef.current?.("AudioWorklet not supported in this browser.");
              setStatus("error");
              ws.close();
              return;
            }

            // Load the audio encoder worklet
            try {
              await ctx.audioWorklet.addModule("/audio-processor.worklet.js");
            } catch {
              onLogRef.current?.("Failed to load audio worklet.");
              setStatus("error");
              ws.close();
              return;
            }

            if (closingRef.current) {
              ws.close();
              ctx.close().catch(() => {});
              return;
            }

            // Mark active now — incoming audio pipeline (AudioContext + worklet)
            // is ready even before the microphone is connected.
            setStatus("active");
            onLogRef.current?.("Connected.");

            // 5. Await getUserMedia — it was started in parallel so it has
            //    likely already resolved by the time we get here.
            const stream = await streamPromise;
            if (!stream) {
              onLogRef.current?.("Microphone access denied.");
              setStatus("error");
              ws.close();
              ctx.close().catch(() => {});
              return;
            }

            if (closingRef.current) {
              // Discard mic if we were asked to disconnect while awaiting.
              stream.getTracks().forEach((t) => t.stop());
              ws.close();
              ctx.close().catch(() => {});
              return;
            }

            streamRef.current = stream;

            // Build the audio graph:
            //   With mute:    micSource → GainNode ─┬─► AnalyserNode
            //                                        └─► AudioWorkletNode
            //   Without mute: micSource ─────────── ─┬─► AnalyserNode
            //                                         └─► AudioWorkletNode
            const micSource = ctx.createMediaStreamSource(stream);
            let upstream: AudioNode = micSource;

            if (enableMute) {
              const muteGain = ctx.createGain();
              // Honour mute state that may have been set while getUserMedia
              // was still pending (e.g. admin clicked Mute before mic granted).
              muteGain.gain.value = muteRef.current ? 0 : 1;
              muteGainRef.current = muteGain;
              micSource.connect(muteGain);
              upstream = muteGain;
            }

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyserRef.current = analyser;
            freqBinsRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
            upstream.connect(analyser);

            const worklet = new AudioWorkletNode(ctx, "audio-processor");
            workletRef.current = worklet;
            upstream.connect(worklet);

            // Worklet message handler — fires every 2048-sample chunk (128ms @ 16kHz)
            worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
              if (ws.readyState !== WebSocket.OPEN) return;

              // Encode Float32 → Int16 and send as binary frame
              const float32 = ev.data;
              const int16 = new Int16Array(float32.length);
              for (let i = 0; i < float32.length; i++) {
                int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
              }
              ws.send(int16.buffer);

              // Automatic frequency-bin VAD
              analyser.getByteFrequencyData(freqBinsRef.current!);
              const avg = voiceBandAvg(
                freqBinsRef.current!,
                ctx.sampleRate,
                analyser.fftSize,
              );
              const speaking = avg > VAD_SILENCE_THRESHOLD;
              ws.send(JSON.stringify({ type: "vad", speaking }));

              if (speaking) {
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
                if (!prevSpeakingRef.current) {
                  prevSpeakingRef.current = true;
                  if (enableBargeIn && agentPlayingRef.current) {
                    stopAgentAudio();
                  }
                  setSpeaker("outgoing");
                }
              } else if (prevSpeakingRef.current && !silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  silenceTimerRef.current = null;
                  prevSpeakingRef.current = false;
                  // Always update the badge when the local mic goes silent.
                  // Use the debounced incoming-voice state: if the remote party
                  // is actively speaking, show "incoming"; otherwise "silent".
                  // (Using prevIncomingVoiceRef rather than a raw energy check
                  // prevents single-chunk glitches from flipping the badge.)
                  setSpeaker(prevIncomingVoiceRef.current ? "incoming" : "silent");
                }, VAD_SILENCE_DEBOUNCE_MS);
              }
            };
          })();
        };
      })();
    },
    [enableMute, enableBargeIn, teardownAudioGraph, stopAgentAudio, playPcmChunk],
  );

  // ------------------------------------------------------------------
  // disconnect
  // ------------------------------------------------------------------
  const disconnect = useCallback(() => {
    closingRef.current = true;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (incomingSilenceTimerRef.current) {
      clearTimeout(incomingSilenceTimerRef.current);
      incomingSilenceTimerRef.current = null;
    }
    teardownAudioGraph();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    setSpeaker("silent");
    // AudioContext is NOT closed here — the useEffect cleanup does it so
    // any in-flight TTS playback drains gracefully before the context dies.
  }, [teardownAudioGraph]);

  // ------------------------------------------------------------------
  // toggleMute
  // ------------------------------------------------------------------
  const toggleMute = useCallback((): boolean => {
    if (!enableMute) return false;
    const next = !muteRef.current;
    muteRef.current = next;
    if (muteGainRef.current) {
      muteGainRef.current.gain.value = next ? 0 : 1;
    }
    setMuted(next);
    return next;
  }, [enableMute]);

  // ------------------------------------------------------------------
  // Unmount cleanup — the only place AudioContext is ever closed.
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      closingRef.current = true;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (incomingSilenceTimerRef.current) {
        clearTimeout(incomingSilenceTimerRef.current);
      }
      teardownAudioGraph();
      wsRef.current?.close();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [teardownAudioGraph]);

  return { status, speaker, muted, connect, disconnect, toggleMute };
}
