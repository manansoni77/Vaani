// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export type Phase = "GREETING" | "CAPTURE" | "VALIDATION" | "DECISION" | "COMPLETE";
export type Sentiment = "neutral" | "calm" | "anxious" | "angry";
export type QueryType = "GRIEVANCE" | "ENQUIRY" | "OTHERS";
export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

export interface Session {
  session_id: string;
  phase: Phase;
  duration_s: number;
  turns: number;
  sentiment: Sentiment;
  /** Urgency expressed as a 0–1 score from the backend model. */
  urgency_score: number;
  human_requested: boolean;
  human_takeover?: boolean;
  claimed_by?: string | null;
  transcript?: string;
  summary?: string;
  intent?: string;
  key_details?: string;
  /** AI confidence score (0–1), null until computed. */
  system_score?: number | null;
  /** User-rated score (0–1), null until provided. */
  user_score?: number | null;
  query_type?: QueryType | null;
  location?: string | null;
  since_when?: string | null;
  routed_department_id?: number | null;
  caller_id?: number | null;
  phone_number?: string | null;
  ticket_id?: number | null;
  language?: string | null;
  // Live-only fields
  caller_speaking?: boolean;
  ai_speaking?: boolean;
  human_speaking?: boolean;
  timestamp?: string;
  // History-only fields
  started_at?: string;
  ended_at?: string;
  audio_url?: string | null;
  audio_mixed_url?: string | null;
}

export interface SessionEvent extends Session {
  event_type: "session_started" | "session_updated" | "session_ended";
}

// ---------------------------------------------------------------------------
// Ticket types
// ---------------------------------------------------------------------------

export type TicketStatus = "in_review" | "in_progress" | "resolved" | "closed";

export interface TicketComment {
  msg: string;
  by: string;
}

export interface Ticket {
  id: number;
  status: TicketStatus;
  priority: string;
  routed_department_id: number | null;
  assigned_to: string | null;
  caller_id: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  session_ids: string[];
  comments: TicketComment[];
}

// ---------------------------------------------------------------------------
// Caller (anonymous) types
// ---------------------------------------------------------------------------

/** Ticket as seen by the caller — no auth required, phone-keyed. */
export interface CallerTicket {
  id: number;
  status: string;
  priority: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  session_ids: string[];
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
