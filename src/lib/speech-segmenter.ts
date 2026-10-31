export type MicrophoneSensitivity = "quiet" | "normal" | "noisy";

export class SpeechSegmenter {
  private noise = 0.006;
  private preRoll: Int16Array[] = [];
  private preRollSamples = 0;
  private chunks: Int16Array[] = [];
  private samples = 0;
  private voiced = 0;
  private quiet = 0;
  private active = false;
  private readonly sensitivity: MicrophoneSensitivity;
  private readonly onCandidate: () => void;

  constructor(sensitivity: MicrophoneSensitivity, onCandidate: () => void) {
    this.sensitivity = sensitivity;
    this.onCandidate = onCandidate;
  }

  reset() {
    this.preRoll = [];
    this.preRollSamples = 0;
    this.chunks = [];
    this.samples = 0;
    this.voiced = 0;
    this.quiet = 0;
    this.active = false;
  }

  push(input: Float32Array): Int16Array | "too-long" | undefined {
    let sum = 0;
    for (const sample of input) sum += sample * sample;
    const rms = Math.sqrt(sum / input.length);
    const factor = this.sensitivity === "quiet" ? 1.6 : this.sensitivity === "noisy" ? 3.4 : 2.4;
    const threshold = Math.max(this.sensitivity === "quiet" ? 0.011 : this.sensitivity === "noisy" ? 0.03 : 0.018, this.noise * factor);
    const loud = rms > threshold;
    const pcm = Int16Array.from(input, (value) => Math.max(-32768, Math.min(32767, value * 32767)));
    if (!this.active) {
      this.preRoll.push(pcm);
      this.preRollSamples += pcm.length;
      while (this.preRoll.length > 1 && this.preRollSamples - this.preRoll[0].length >= 4800) this.preRollSamples -= this.preRoll.shift()!.length;
      if (loud) {
        if (this.voiced === 0) this.onCandidate();
        this.voiced += input.length;
        if (this.voiced >= 2400) {
          this.active = true;
          this.chunks = this.preRoll;
          this.samples = this.preRollSamples;
          this.preRoll = [];
          this.preRollSamples = 0;
          this.quiet = 0;
        }
      } else {
        this.voiced = 0;
        this.noise = Math.max(0.003, Math.min(0.08, this.noise * 0.97 + rms * 0.03));
      }
      return;
    }
    this.chunks.push(pcm);
    this.samples += pcm.length;
    if (loud) { this.voiced += input.length; this.quiet = 0; }
    else this.quiet += input.length;
    if (this.samples > 320000) { this.reset(); return "too-long"; }
    if (this.quiet >= 19200) {
      const result = new Int16Array(this.samples);
      let offset = 0;
      for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; }
      this.reset();
      return result;
    }
  }
}
