export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost:8000";

export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "56977159972-pouu14nullmd1nk75v09q2uimr3p0g0e.apps.googleusercontent.com";
