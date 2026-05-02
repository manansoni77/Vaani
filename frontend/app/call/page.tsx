"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

type CallStatus = "idle" | "connecting" | "active" | "disconnected";
type Speaker = "silent" | "user" | "agent";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost:8000";

// Average magnitude of voice-band frequency bins (85–3000 Hz) below this is silence.
const VAD_SILENCE_THRESHOLD = 100;
// How long audio must stay below threshold before the state flips to silent.
const VAD_SILENCE_DEBOUNCE_MS = 400;
const TTS_SAMPLE_RATE = 16000; // bulbul:v3 PCM output rate

function voiceBandAvg(bins: Uint8Array, sampleRate: number, fftSize: number): number {
  const binHz = sampleRate / fftSize;
  let sum = 0, count = 0;
  for (let i = 0; i < bins.length; i++) {
    const freq = i * binHz;
    if (freq >= 85 && freq <= 255) { sum += bins[i]; count++; }
  }
  return count > 0 ? sum / count : 0;
}

export default function CallPage() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [speaker, setSpeaker] = useState<Speaker>("silent");

  const wsRef = useRef<WebSocket | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const closingRef = useRef(false);
  const prevSpeakingRef = useRef(false);
  const agentPlayingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextPlayTimeRef = useRef(0);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopCall = useCallback(() => {
    closingRef.current = true;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    cleanup();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    setSpeaker("silent");
    addLog("Call ended.");
  }, [addLog, cleanup]);

  const playPcmChunk = useCallback((data: ArrayBuffer) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === "closed") return;

      const int16 = new Int16Array(data);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      const buffer = ctx.createBuffer(1, float32.length, TTS_SAMPLE_RATE);
      buffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + buffer.duration;

      if (!agentPlayingRef.current) {
        agentPlayingRef.current = true;
        setSpeaker("agent");
      }
      source.onended = () => {
        if (nextPlayTimeRef.current <= ctx.currentTime + 0.05) {
          agentPlayingRef.current = false;
          setSpeaker(prevSpeakingRef.current ? "user" : "silent");
        }
      };
    } catch (err) {
      addLog(`PCM playback error: ${err}`);
    }
  }, [addLog]);

  const startCall = useCallback(async () => {
    closingRef.current = false;
    prevSpeakingRef.current = false;
    agentPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setStatus("connecting");
    setSpeaker("silent");
    setSessionId(null);
    setLogs([]);
    addLog("Requesting microphone access...");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;
    } catch {
      addLog("Microphone access denied.");
      setStatus("idle");
      return;
    }

    addLog("Connecting to server...");
    const ws = new WebSocket(`${WS_BASE}/call`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      void (async () => {
        setStatus("active");
        addLog("Connected.");

        const ctx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = ctx;

        try {
          await ctx.audioWorklet.addModule("/audio-processor.worklet.js");
        } catch {
          addLog("Failed to load audio worklet.");
          setStatus("disconnected");
          return;
        }

        const micSource = ctx.createMediaStreamSource(stream);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        micSource.connect(analyser);
        const freqBins = new Uint8Array(analyser.frequencyBinCount);

        const worklet = new AudioWorkletNode(ctx, "audio-processor");
        processorRef.current = worklet;

        worklet.port.onmessage = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const float32: Float32Array = e.data;
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
          }
          ws.send(int16.buffer);

          analyser.getByteFrequencyData(freqBins);
          const avg = voiceBandAvg(freqBins, ctx.sampleRate, analyser.fftSize);
          console.log(freqBins);
          console.log("VAD avg:", avg);
          const speaking = avg > VAD_SILENCE_THRESHOLD;
          ws.send(JSON.stringify({ type: "vad", speaking }));

          if (speaking) {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
            if (!prevSpeakingRef.current) {
              prevSpeakingRef.current = true;
              if (!agentPlayingRef.current) setSpeaker("user");
            }
          } else if (prevSpeakingRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null;
              prevSpeakingRef.current = false;
              if (!agentPlayingRef.current) setSpeaker("silent");
            }, VAD_SILENCE_DEBOUNCE_MS);
          }
        };

        micSource.connect(worklet);
      })();
    };

    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data) as Record<string, unknown>;
          if (msg.type === "metadata" && typeof msg.session_id === "string") {
            setSessionId(msg.session_id);
            addLog(`Session ID: ${msg.session_id}`);
          }
        } catch {
          addLog(`Server message: ${e.data}`);
        }
      } else if (e.data instanceof ArrayBuffer) {
        playPcmChunk(e.data);
      }
    };

    ws.onerror = () => addLog("WebSocket error.");

    ws.onclose = () => {
      cleanup();
      if (!closingRef.current) {
        addLog("Disconnected from server.");
        setStatus("disconnected");
      }
    };
  }, [addLog, cleanup, playPcmChunk]);

  useEffect(() => {
    return () => {
      closingRef.current = true;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      cleanup();
      wsRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, [cleanup]);

  const isActive = status === "active";
  const isConnecting = status === "connecting";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Call
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Real-time audio session
          </p>
        </div>

        {/* Status & controls card */}
        <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Status
            </span>
            <StatusBadge status={status} />
          </div>

          {sessionId && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">
                Session
              </span>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded truncate">
                {sessionId}
              </span>
            </div>
          )}

          {isActive && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Speaking
              </span>
              <SpeakerBadge speaker={speaker} />
            </div>
          )}

          <div className="flex flex-col items-center gap-3 py-4">
            <button
              onClick={isActive ? stopCall : startCall}
              disabled={isConnecting}
              aria-label={isActive ? "End call" : "Start call"}
              className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                isActive
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {isConnecting ? (
                <SpinnerIcon />
              ) : isActive ? (
                <EndCallIcon />
              ) : (
                <PhoneIcon />
              )}
            </button>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isActive
                ? "Tap to end call"
                : isConnecting
                ? "Connecting..."
                : "Tap to start call"}
            </p>
          </div>
        </div>

        {/* Activity log */}
        <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
            Activity
          </h2>
          <div className="h-44 overflow-y-auto flex flex-col gap-0.5 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-slate-400 dark:text-slate-500 text-center mt-10">
                No activity yet
              </p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className="text-slate-600 dark:text-slate-400 leading-relaxed"
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        <Link
          href="/"
          className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

function SpeakerBadge({ speaker }: { speaker: Speaker }) {
  const styles: Record<Speaker, { label: string; cls: string }> = {
    silent: {
      label: "SILENT",
      cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
    },
    user: {
      label: "USER",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    agent: {
      label: "AGENT",
      cls: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    },
  };
  const { label, cls } = styles[speaker];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${cls}`}
    >
      {speaker !== "silent" && (
        <span
          className={`w-2 h-2 rounded-full animate-pulse ${
            speaker === "user" ? "bg-blue-500" : "bg-purple-500"
          }`}
        />
      )}
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: CallStatus }) {
  const styles: Record<CallStatus, { label: string; cls: string }> = {
    idle: {
      label: "Idle",
      cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    },
    connecting: {
      label: "Connecting",
      cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    },
    active: {
      label: "Active",
      cls: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    disconnected: {
      label: "Disconnected",
      cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
  };
  const { label, cls } = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {status === "active" && (
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
      {label}
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-9 h-9 fill-current">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
    </svg>
  );
}

function EndCallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-9 h-9 fill-current">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="w-9 h-9 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
