import { headers, request } from "./api.ts";
import { SpeechSegmenter } from "./speech-segmenter.ts";
import type { MicrophoneSensitivity } from "./speech-segmenter.ts";
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
  private listeningAfter = 0;
  private outputPending = false;
  private playbackId = 0;
  private outputPart = 0;
  private segmenter?: SpeechSegmenter;
  private candidateToken?: string;
  private readonly getPendingToken: () => string | undefined;
  private readonly sensitivity: MicrophoneSensitivity;
  private status: (s: VoiceStatus) => void;
  private transcript: (t: string, pendingToken?: string) => Promise<string | undefined>;
  private error: (s: string) => void;
  constructor(
    status: (s: VoiceStatus) => void,
    transcript: (t: string, pendingToken?: string) => Promise<string | undefined>,
    error: (s: string) => void,
    sensitivity: MicrophoneSensitivity = "normal",
    getPendingToken: () => string | undefined = () => undefined,
  ) {
    this.status = status;
    this.transcript = transcript;
    this.error = error;
    this.sensitivity = sensitivity;
    this.getPendingToken = getPendingToken;
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
      if (this.context.sampleRate !== 16000)
        throw new Error("Браузер не поддерживает запись с частотой 16 кГц.");
      await this.context.resume();
      if (generation !== this.generation) return;
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = this.context.createScriptProcessor(1024, 1, 1);
      this.active = true;
      this.status("listening");
      this.segmenter = new SpeechSegmenter(this.sensitivity, () => { this.candidateToken = this.getPendingToken(); });
      this.processor.onaudioprocess = (e) => {
        if (!this.active || this.busy || this.outputPending || (this.audio && !this.audio.paused) || performance.now() < this.listeningAfter) return;
        const segment = this.segmenter?.push(e.inputBuffer.getChannelData(0));
        if (segment === "too-long") {
          this.error(
            "Реплика слишком длинная и могла оборваться. Разделите её на короткие фразы. Ничего не сохранено.",
          );
        } else if (segment) void this.recognize(segment, this.candidateToken);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);
    } catch (e) {
      this.stop();
      this.error(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Нет доступа к микрофону. Разрешите доступ в браузере или используйте текст."
          : e instanceof Error && e.message.includes("16 кГц")
            ? e.message
            : "Не удалось включить микрофон. Используйте текстовый ввод.",
      );
    }
  }
  private async recognize(pcm: Int16Array, pendingToken?: string) {
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
      this.error("");
      if (!result.text.trim()) return;
      const message = await this.transcript(result.text, pendingToken);
      if (message && this.active) await this.speak(message);
    } catch (e) {
      if (this.active)
        this.error(
          e instanceof Error ? e.message : "Не удалось распознать речь.",
        );
    } finally {
      this.busy = false;
      if (this.active && !this.outputPending && (!this.audio || this.audio.paused))
        this.status("listening");
    }
  }
  async speak(messageId: string) {
    this.interrupt();
    this.segmenter?.reset();
    await this.playPart(messageId, 0, this.playbackId, this.generation);
  }
  private async playPart(messageId: string, part: number, playbackId: number, generation: number) {
    this.outputPending = true;
    this.outputPart = part;
    this.controller = new AbortController();
    try {
      const response = await fetch("/api/voice/synthesize", {
        method: "POST", headers,
        body: JSON.stringify({ messageId, part }),
        signal: this.controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось озвучить ответ. Текст ответа сохранён.");
      }
      const parts = Number(response.headers.get("X-TTS-Parts") || "1");
      if (!Number.isSafeInteger(parts) || parts < 1 || parts > 100 || part >= parts)
        throw new Error("Не удалось получить все части озвучивания.");
      const blob = await response.blob();
      if (!this.active || generation !== this.generation || playbackId !== this.playbackId) return;
      this.audioUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this.audioUrl);
      this.status("speaking");
      this.audio.onended = () => {
        if (!this.active || playbackId !== this.playbackId) return;
        this.releaseAudio();
        if (part + 1 < parts) {
          this.outputPending = true;
          void this.playPart(messageId, part + 1, playbackId, generation).catch((error) => {
            if (this.active && playbackId === this.playbackId) {
              this.error(error instanceof Error ? error.message : "Не удалось озвучить ответ полностью.");
              this.finishPlayback();
            }
          });
        } else this.finishPlayback();
      };
      this.audio.onerror = () => {
        if (this.active && playbackId === this.playbackId) {
          this.error("Не удалось воспроизвести ответ полностью.");
          this.finishPlayback();
        }
      };
      await this.audio.play();
      this.busy = false;
    } catch (error) {
      if (playbackId === this.playbackId) this.releaseAudio();
      throw error;
    } finally {
      if (playbackId === this.playbackId && part === this.outputPart) this.outputPending = false;
    }
  }
  private releaseAudio() {
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; }
    this.audio?.pause();
    this.audio = undefined;
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = undefined;
  }
  private finishPlayback() {
    this.releaseAudio();
    this.segmenter?.reset();
    this.listeningAfter = performance.now() + 700;
    if (this.active) this.status("listening");
  }
  interrupt() {
    this.playbackId++;
    this.controller?.abort();
    this.releaseAudio();
    this.outputPending = false;
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
    this.segmenter?.reset();
    this.segmenter = undefined;
    this.outputPending = false;
    this.busy = false;
    this.status("off");
  }
}
