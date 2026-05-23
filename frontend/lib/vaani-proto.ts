// Hand-rolled protobuf encode/decode matching proto/vaani.proto
// Field encoding: (fieldNumber << 3) | wireType
// Wire types: 0=varint, 2=length-delimited

function encodeVarint(val: number): number[] {
  const out: number[] = [];
  do {
    let b = val & 0x7f;
    val = Math.floor(val / 128);
    if (val !== 0) b |= 0x80;
    out.push(b);
  } while (val !== 0);
  return out;
}

function decodeVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let factor = 1;
  let pos = offset;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    value += (b & 0x7f) * factor;
    factor *= 128;
    if (!(b & 0x80)) break;
  }
  return { value, next: pos };
}

function tag(field: number, wire: number): number[] {
  return encodeVarint((field << 3) | wire);
}

function lenDelim(data: Uint8Array): number[] {
  return [...encodeVarint(data.length), ...Array.from(data)];
}

function join(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p instanceof Uint8Array ? p : new Uint8Array(p), off);
    off += p.length;
  }
  return out;
}

function skipField(bytes: Uint8Array, i: number, wire: number): number {
  if (wire === 0) { return decodeVarint(bytes, i).next; }
  if (wire === 1) { return i + 8; }
  if (wire === 2) { const r = decodeVarint(bytes, i); return r.next + r.value; }
  if (wire === 5) { return i + 4; }
  return bytes.length; // unknown wire type — bail
}

// ── AudioChunk { bytes pcm_data = 1; } ───────────────────────────────────────

export class AudioChunk {
  private data: Uint8Array = new Uint8Array(0);

  setPcmData(d: Uint8Array): this { this.data = d; return this; }
  getPcmData_asU8(): Uint8Array { return this.data; }

  serializeBinary(): Uint8Array {
    if (!this.data.length) return new Uint8Array(0);
    return join(tag(1, 2), lenDelim(this.data));
  }

  static deserializeBinary(bytes: Uint8Array): AudioChunk {
    const m = new AudioChunk();
    let i = 0;
    while (i < bytes.length) {
      const { value: t, next } = decodeVarint(bytes, i); i = next;
      const field = t >>> 3, wire = t & 7;
      if (field === 1 && wire === 2) {
        const { value: len, next: d } = decodeVarint(bytes, i); i = d;
        m.data = bytes.slice(i, i + len); i += len;
      } else {
        i = skipField(bytes, i, wire);
      }
    }
    return m;
  }
}

// ── VadSignal { bool speaking = 1; } ─────────────────────────────────────────

export class VadSignal {
  private _speaking = false;

  setSpeaking(v: boolean): this { this._speaking = v; return this; }
  getSpeaking(): boolean { return this._speaking; }

  serializeBinary(): Uint8Array {
    return join(tag(1, 0), encodeVarint(this._speaking ? 1 : 0));
  }

  static deserializeBinary(bytes: Uint8Array): VadSignal {
    const m = new VadSignal();
    let i = 0;
    while (i < bytes.length) {
      const { value: t, next } = decodeVarint(bytes, i); i = next;
      const field = t >>> 3, wire = t & 7;
      if (field === 1 && wire === 0) {
        const { value, next: d } = decodeVarint(bytes, i); i = d;
        m._speaking = value !== 0;
      } else {
        i = skipField(bytes, i, wire);
      }
    }
    return m;
  }
}

// ── SessionMetadata { string session_id = 1; } ───────────────────────────────

export class SessionMetadata {
  private _sessionId = "";

  getSessionId(): string { return this._sessionId; }

  static deserializeBinary(bytes: Uint8Array): SessionMetadata {
    const m = new SessionMetadata();
    const dec = new TextDecoder();
    let i = 0;
    while (i < bytes.length) {
      const { value: t, next } = decodeVarint(bytes, i); i = next;
      const field = t >>> 3, wire = t & 7;
      if (field === 1 && wire === 2) {
        const { value: len, next: d } = decodeVarint(bytes, i); i = d;
        m._sessionId = dec.decode(bytes.slice(i, i + len)); i += len;
      } else {
        i = skipField(bytes, i, wire);
      }
    }
    return m;
  }
}

// ── CallClientMessage { oneof { AudioChunk audio=1; VadSignal vad=2; } } ─────

export class CallClientMessage {
  private _audio: AudioChunk | null = null;
  private _vad: VadSignal | null = null;

  setAudio(c: AudioChunk): this { this._audio = c; this._vad = null; return this; }
  setVad(v: VadSignal): this { this._vad = v; this._audio = null; return this; }

  serializeBinary(): Uint8Array {
    if (this._audio) {
      const payload = this._audio.serializeBinary();
      return join(tag(1, 2), lenDelim(payload));
    }
    if (this._vad) {
      const payload = this._vad.serializeBinary();
      return join(tag(2, 2), lenDelim(payload));
    }
    return new Uint8Array(0);
  }
}

// ── CallServerMessage { oneof { metadata=1; audio=2; end_call=3; } } ─────────

export class CallServerMessage {
  private _metadata: SessionMetadata | null = null;
  private _audio: AudioChunk | null = null;
  private _endCall = false;

  hasMetadata(): boolean { return this._metadata !== null; }
  getMetadata(): SessionMetadata | null { return this._metadata; }
  hasAudio(): boolean { return this._audio !== null; }
  getAudio(): AudioChunk | null { return this._audio; }
  hasEndCall(): boolean { return this._endCall; }

  static deserializeBinary(bytes: Uint8Array): CallServerMessage {
    const m = new CallServerMessage();
    let i = 0;
    while (i < bytes.length) {
      const { value: t, next } = decodeVarint(bytes, i); i = next;
      const field = t >>> 3, wire = t & 7;
      if (wire === 2) {
        const { value: len, next: d } = decodeVarint(bytes, i); i = d;
        const payload = bytes.slice(i, i + len); i += len;
        if (field === 1) m._metadata = SessionMetadata.deserializeBinary(payload);
        else if (field === 2) m._audio = AudioChunk.deserializeBinary(payload);
        else if (field === 3) m._endCall = true; // EndCall is an empty message
      } else {
        i = skipField(bytes, i, wire);
      }
    }
    return m;
  }
}
