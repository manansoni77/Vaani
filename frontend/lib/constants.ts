// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Default page size for paginated list views (admin, audit, dataset). */
export const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Audio stream (useAudioStream hook)
// ---------------------------------------------------------------------------

/** Average magnitude of voice-band FFT bins below this value = silence. */
export const VAD_SILENCE_THRESHOLD = 100;

/** Milliseconds the user must stay silent before the VAD flips to "silent". */
export const VAD_SILENCE_DEBOUNCE_MS = 400;

/** PCM sample rate for both microphone encoding and TTS playback (bulbul:v3). */
export const TTS_SAMPLE_RATE = 16000;

/**
 * Minimum average absolute Int16 magnitude (0–32767) for an incoming PCM
 * chunk to count as voice. Muted senders produce true zeros; a speaking
 * caller typically reaches thousands. 300 is well above quantisation noise
 * but low enough to catch soft speech.
 */
export const INCOMING_VAD_THRESHOLD = 300;

// ---------------------------------------------------------------------------
// Audit page — filter options
// ---------------------------------------------------------------------------

export const AUDIT_ENTITIES = [
  "APP",
  "CALL",
  "SARVAM_STT",
  "SARVAM_TTS",
  "OPENAI_LLM",
  "DIALOGUE_FLOW",
  "HUMAN_AGENT",
  "KB_RETRIEVAL",
] as const;

export const AUDIT_LEVELS = [
  "DEBUG",
  "INFO",
  "WARNING",
  "ERROR",
  "CRITICAL",
] as const;

// ---------------------------------------------------------------------------
// Audit page — shared form element class strings
// ---------------------------------------------------------------------------

export const AUDIT_INPUT_CLS =
  "px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-400";

export const AUDIT_SELECT_CLS =
  "px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-400";

// ---------------------------------------------------------------------------
// Admin panel — role display and permission constants
// ---------------------------------------------------------------------------

import type { RoleType } from "@/lib/userStore";

export const ROLE_LABELS: Record<RoleType, string> = {
  super_admin:       "Super Admin",
  it_admin:          "IT Admin",
  call_center_admin: "Call Center Admin",
  call_center_user:  "Call Center Agent",
  dept_admin:        "Department Admin",
  dept_user:         "Department User",
};

/** Roles that each caller role is permitted to create via POST /users/register. */
export const CREATABLE_ROLES: Partial<Record<RoleType, RoleType[]>> = {
  super_admin:       ["call_center_admin", "call_center_user", "dept_admin", "dept_user"],
  call_center_admin: ["call_center_user"],
  dept_admin:        ["dept_user"],
};

/** Roles that require a department_id when registering. */
export const DEPT_REQUIRED_ROLES = new Set<RoleType>(["dept_admin", "dept_user"]);

/** Roles that can access the admin panel (GET /users, POST /users/register). */
export const CAN_MANAGE_ROLES = new Set<RoleType>(["super_admin", "call_center_admin", "dept_admin"]);

// ---------------------------------------------------------------------------
// Admin panel — shared form element class strings
// ---------------------------------------------------------------------------

export const FORM_INPUT_CLS =
  "px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full";

export const FORM_LABEL_CLS =
  "text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block";

// ---------------------------------------------------------------------------
// Dataset page — model type badge colours
// ---------------------------------------------------------------------------

export const MODEL_TYPE_CLS: Record<
  "seq2seq" | "classification" | "extraction" | "reward",
  string
> = {
  seq2seq:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  classification:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  extraction:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  reward:
    "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};
