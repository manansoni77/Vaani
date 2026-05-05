export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost:8000";
