// ---------------------------------------------------------------------------
// Session types (used by admin page and its sub-components)
// ---------------------------------------------------------------------------

export type Phase = "GREETING" | "CAPTURE" | "VALIDATION" | "DECISION" | "COMPLETE";
export type Sentiment = "neutral" | "calm" | "anxious" | "angry";
export type Urgency = "none" | "low" | "medium" | "high";
export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

export interface Session {
  id?: number;
  session_id: string;
  phase: Phase;
  duration_s: number;
  turns: number;
  sentiment: Sentiment;
  urgency_level: Urgency;
  human_requested: boolean;
  human_takeover?: boolean;
  claimed_by?: string | null;
  transcript?: string;
  started_at?: string;
  ended_at?: string;
  audio_url?: string | null;
  audio_mixed_url?: string | null;
  summary?: string;
  intent?: string;
  key_details?: string;
  agent_confidence?: "GREEN" | "YELLOW" | "RED";
  user_confidence?: "GREEN" | "YELLOW" | "RED";
  query_type?: "EMERGENCY" | "MUNICIPALITY" | "GENERAL" | null;
  service_type?: "police" | "medical" | "fire" | "disaster_relief" | null;
  location?: string | null;
  since_when?: string | null;
  // Live-only fields
  caller_speaking?: boolean;
  ai_speaking?: boolean;
  human_speaking?: boolean;
  timestamp?: string;
}

export interface SessionEvent extends Session {
  event_type: "session_started" | "session_updated" | "session_ended";
}

// ---------------------------------------------------------------------------
// Audit types
// ---------------------------------------------------------------------------

export interface LogEntry {
  id?: number;
  level: string;
  entity: string;
  session_id: string | null;
  timestamp: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Dataset types
// ---------------------------------------------------------------------------

export interface DatasetMeta {
  name: string;
  description: string;
  input_columns: string[];
  output_columns: string[];
  model_type: "seq2seq" | "classification" | "extraction" | "reward";
  count: number;
}

export interface DatasetPage {
  name: string;
  total: number;
  limit: number;
  offset: number;
  samples: DatasetSample[];
}

export interface DatasetSample {
  session_id: string;
  [column: string]: string | number | boolean | null;
}
