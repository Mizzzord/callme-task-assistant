import { headers, request } from "./api";
export type VoiceStatus = "off" | "listening" | "processing" | "speaking";
export class VoiceSession {
  stream?: MediaStream;
  context?: AudioContext;
  processor?: ScriptProcessorNode;
  source?: MediaStreamAudioSourceNode;
  audio?: HTMLAudioElement;
  controller?: AbortController;
  active = false;
  busy = false;
  private generation = 0;
  private audioUrl?: string;
  private status: (s: VoiceStatus) => void;
  private transcript: (t: string) => Promise<string | undefined>;
  private error: (s: string) => void;
  constructor(
    status: (s: VoiceStatus) => void,
    transcript: (t: string) => Promise<string | undefined>,
    error: (s: string) => void,
  ) {
    this.status = status;
    this.transcript = transcript;
    this.error = error;
  }
  async start() {
    const generation = ++this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.context = new AudioContext({ sampleRate: 16000 });
      await this.context.resume();
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.active = true;
      this.status("listening");
      let chunks: Int16Array[] = [];
      let samples = 0;
      let quiet = 0;
      let speech = 0;
      this.processor.onaudioprocess = (e) => {
        if (!this.active || this.busy) return;
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (const v of input) sum += v * v;
        const loud = Math.sqrt(sum / input.length) > 0.025;
        if (loud) {
          speech += input.length;
          quiet = 0;
          if (this.audio && !this.audio.paused) {
            this.interrupt();
            this.status("listening");
          }
        } else quiet += input.length;
        if (loud || chunks.length) {
          chunks.push(
            Int16Array.from(input, (v) =>
              Math.max(-32768, Math.min(32767, v * 32767)),
            ),
          );
          samples += input.length;
        }
        if (samples > 320000) {
          chunks = [];
          samples = 0;
          speech = 0;
          quiet = 0;
          this.error(
            "Реплика слишком длинная и могла оборваться. Разделите её на короткие фразы. Ничего не сохранено.",
          );
          return;
        }
        if (quiet > 19200 && speech > 3200) {
          const pcm = new Int16Array(samples);
          let offset = 0;
          for (const c of chunks) {
            pcm.set(c, offset);
            offset += c.length;
          }
          chunks = [];
          samples = 0;
          speech = 0;
          quiet = 0;
          void this.recognize(pcm);
        } else if (quiet > 32000) {
          chunks = [];
          samples = 0;
          speech = 0;
        }
      };
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);
    } catch (e) {
      this.stop();
      this.error(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Нет доступа к микрофону. Разрешите доступ в браузере или используйте текст."
          : "Не удалось включить микрофон. Используйте текстовый ввод.",
      );
    }
  }
  private async recognize(pcm: Int16Array) {
    this.busy = true;
    this.status("processing");
    this.controller = new AbortController();
    try {
      const result = await request<{ text: string }>("/api/voice/recognize", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-app-request": "voice-planner",
        },
        body: new Blob([new Uint8Array(new Int16Array(pcm).buffer)]),
        signal: this.controller.signal,
      });
      if (!this.active) return;
      const message = await this.transcript(result.text);
      if (message && this.active) await this.speak(message);
    } catch (e) {
      if (this.active)
        this.error(
          e instanceof Error ? e.message : "Не удалось распознать речь.",
        );
    } finally {
      this.busy = false;
      if (this.active && (!this.audio || this.audio.paused))
        this.status("listening");
    }
  }
  async speak(messageId: string) {
    this.interrupt();
    const generation = this.generation;
    this.controller = new AbortController();
    const response = await fetch("/api/voice/synthesize", {
      method: "POST",
      headers,
      body: JSON.stringify({ messageId }),
      signal: this.controller.signal,
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || "Не удалось озвучить ответ. Текст ответа сохранён.",
      );
    }
    const blob = await response.blob();
    if (!this.active || generation !== this.generation) return;
    this.audioUrl = URL.createObjectURL(blob);
    this.audio = new Audio(this.audioUrl);
    this.status("speaking");
    this.audio.onended = () => {
      this.interrupt();
      if (this.active) this.status("listening");
    };
    await this.audio.play();
    this.busy = false;
  }
  interrupt() {
    this.audio?.pause();
    this.audio = undefined;
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = undefined;
  }
  stop() {
    this.generation++;
    this.active = false;
    this.controller?.abort();
    this.interrupt();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close();
    this.processor = undefined;
    this.context = undefined;
    this.busy = false;
    this.status("off");
  }
}
