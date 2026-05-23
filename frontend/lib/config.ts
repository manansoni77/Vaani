export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost:8000";

// Default to the local rewrite proxy ("/grpc") so the browser never makes a
// cross-origin request. Set NEXT_PUBLIC_GRPC_URL to an absolute URL in production
// if the backend CORS headers are correctly configured there.
export const GRPC_BASE =
  process.env.NEXT_PUBLIC_GRPC_URL?.replace(/\/$/, "") ?? "http://localhost:8000/grpc";
