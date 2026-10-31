import { request } from "./api.ts";

export class VoiceRecording {
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private chunks: Int16Array[] = [];
  private samples = 0;
  private generation = 0;
  private controller?: AbortController;
  private capturing = false;
  private onLimit: () => void;

  constructor(onLimit: () => void) { this.onLimit = onLimit; }

  async start() {
    const generation = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    this.stream = stream;
    try {
      this.context = new AudioContext({ sampleRate: 16000 });
      if (this.context.sampleRate !== 16000) throw new Error("Браузер не поддерживает запись с частотой 16 кГц.");
      await this.context.resume();
      if (generation !== this.generation) return false;
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.chunks = [];
      this.samples = 0;
      this.capturing = true;
      this.processor.onaudioprocess = (event) => {
        if (!this.capturing) return;
        const input = event.inputBuffer.getChannelData(0);
        const remaining = 320000 - this.samples;
        const data = input.subarray(0, remaining);
        this.chunks.push(Int16Array.from(data, (v) => Math.max(-32768, Math.min(32767, v * 32767))));
        this.samples += data.length;
        if (this.samples >= 320000) {
          this.capturing = false;
          this.onLimit();
        }
      };
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);
      return true;
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  async finish() {
    const generation = this.generation;
    this.capturing = false;
    const pcm = new Int16Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
    this.release();
    if (pcm.length < 1600) throw new Error("Запись слишком короткая. Запишите фразу ещё раз.");
    this.controller = new AbortController();
    const result = await request<{ text: string }>("/api/voice/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "x-app-request": "voice-planner" },
      body: new Blob([new Uint8Array(pcm.buffer)]),
      signal: this.controller.signal,
    });
    return generation === this.generation ? result.text : undefined;
  }

  cancel() {
    this.generation++;
    this.capturing = false;
    this.controller?.abort();
    this.release();
  }

  private release() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.processor = undefined;
    this.source = undefined;
    this.stream = undefined;
    this.context = undefined;
    this.chunks = [];
    this.samples = 0;
  }
}
