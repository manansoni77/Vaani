// Minimal gRPC-Web bidirectional stream over fetch().
// Requires Chrome 105+ / Firefox 110+ for streaming request bodies.
// For Safari < 16.4 fall back to the WebSocket transport.

type Handlers<RESP> = {
  data: ((msg: RESP) => void)[];
  error: ((err: Error) => void)[];
  end: (() => void)[];
};

export class GrpcBidiStream<REQ, RESP> {
  private ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  private abort = new AbortController();
  private closed = false;
  private readonly handlers: Handlers<RESP> = { data: [], error: [], end: [] };

  constructor(
    url: string,
    metadata: Record<string, string>,
    private readonly serialize: (req: REQ) => Uint8Array,
    deserialize: (bytes: Uint8Array) => RESP,
  ) {
    const body = new ReadableStream<Uint8Array>({
      start: (c) => { this.ctrl = c; },
    });

    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/grpc-web+proto",
        "X-Grpc-Web": "1",
        ...metadata,
      },
      body,
      signal: this.abort.signal,
    };
    // duplex:'half' is required for streaming request bodies (Chrome 105+)
    (init as Record<string, unknown>).duplex = "half";

    fetch(url, init)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        if (!res.body) throw new Error("Response has no body");
        return this.readFrames(res.body, deserialize);
      })
      .catch((err: Error) => {
        if (!this.closed) this.fire("error", err);
      });
  }

  private encodeFrame(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(5 + data.length);
    const len = data.length;
    // byte 0: 0x00 = not compressed
    out[1] = (len >>> 24) & 0xff;
    out[2] = (len >>> 16) & 0xff;
    out[3] = (len >>> 8) & 0xff;
    out[4] = len & 0xff;
    out.set(data, 5);
    return out;
  }

  private async readFrames(
    stream: ReadableStream<Uint8Array>,
    deserialize: (bytes: Uint8Array) => RESP,
  ) {
    const reader = stream.getReader();
    let buf = new Uint8Array(0);

    try {
      loop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const merged = new Uint8Array(buf.length + value.length);
        merged.set(buf);
        merged.set(value, buf.length);
        buf = merged;

        while (buf.length >= 5) {
          const isTrailer = (buf[0] & 0x80) !== 0;
          const len = (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4];
          if (buf.length < 5 + len) break;

          const payload = buf.slice(5, 5 + len);
          buf = buf.slice(5 + len);

          if (isTrailer) {
            this.parseTrailer(payload);
            break loop;
          }

          try {
            this.fire("data", deserialize(payload));
          } catch (e) {
            this.fire("error", e instanceof Error ? e : new Error(String(e)));
          }
        }
      }
    } catch (err) {
      if (!this.closed) this.fire("error", err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.fire("end");
    }
  }

  private parseTrailer(payload: Uint8Array) {
    const text = new TextDecoder().decode(payload);
    const statusMatch = text.match(/grpc-status:\s*(\d+)/);
    const code = statusMatch ? parseInt(statusMatch[1]) : -1;
    if (code !== 0) {
      const msgMatch = text.match(/grpc-message:\s*([^\r\n]*)/);
      const detail = msgMatch ? decodeURIComponent(msgMatch[1].trim()) : "unknown error";
      this.fire("error", new Error(`gRPC status ${code}: ${detail}`));
    }
  }

  write(msg: REQ): void {
    if (this.closed || !this.ctrl) return;
    this.ctrl.enqueue(this.encodeFrame(this.serialize(msg)));
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.ctrl?.close(); } catch {}
    this.ctrl = null;
    this.abort.abort();
  }

  on(event: "data", handler: (msg: RESP) => void): this;
  on(event: "error", handler: (err: Error) => void): this;
  on(event: "end", handler: () => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): this {
    (this.handlers as Record<string, unknown[]>)[event]?.push(handler);
    return this;
  }

  private fire(event: "data", msg: RESP): void;
  private fire(event: "error", err: Error): void;
  private fire(event: "end"): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fire(event: string, ...args: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.handlers as Record<string, ((...a: any[]) => void)[]>)[event]
      ?.forEach((h) => h(...args));
  }
}
