const CHUNK_SAMPLES = 2048; // 128ms @ 16kHz

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(CHUNK_SAMPLES);
    this._filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    let offset = 0;
    while (offset < channel.length) {
      const space = CHUNK_SAMPLES - this._filled;
      const toCopy = Math.min(space, channel.length - offset);
      this._buf.set(channel.subarray(offset, offset + toCopy), this._filled);
      this._filled += toCopy;
      offset += toCopy;

      if (this._filled === CHUNK_SAMPLES) {
        this.port.postMessage(this._buf.slice(0));
        this._filled = 0;
      }
    }
    return true; // keep processor alive
  }
}

registerProcessor("audio-processor", AudioProcessor);
