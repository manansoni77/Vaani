/**
 * Formats a duration in seconds as M:SS (e.g. 125 → "2:05").
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Converts a snake_case or underscore-separated name to Title Case.
 * e.g. "sentiment_analysis" → "Sentiment Analysis"
 */
export function formatName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
