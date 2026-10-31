import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceSession } from "../src/lib/voice.ts";

test("speaker playback is not interrupted by microphone audio or sent for recognition", async () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  let processAudio: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | undefined;
  let paused = true, recognitionCalls = 0;
  class FakeContext {
    sampleRate = 16000; destination = {};
    async resume() {} async close() {}
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, set onaudioprocess(fn: (event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) { processAudio = fn; } }; }
  }
  class FakeAudio {
    onended: (() => void) | null = null;
    get paused() { return paused; }
    async play() { paused = false; }
    pause() { paused = true; }
  }
  const fetchBefore = globalThis.fetch;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  replace("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  replace("AudioContext", FakeContext);
  replace("Audio", FakeAudio);
  URL.createObjectURL = () => "blob:test"; URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url) => { if (String(url).includes("recognize")) recognitionCalls++; return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); };
  try {
    const session = new VoiceSession(() => {}, async () => undefined, () => {});
    await session.start(); await session.speak("fake-message");
    assert.equal(paused, false);
    assert(processAudio);
    processAudio({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.15) } });
    assert.equal(paused, false, "speaker playback must finish despite microphone sound");
    assert.equal(recognitionCalls, 0);
    session.stop();
  } finally {
    globalThis.fetch = fetchBefore; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    for (const [key, desc] of originals) { if (desc) Object.defineProperty(globalThis, key, desc); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("captures the confirmation token at the start of the utterance", async () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  let processAudio: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | undefined;
  let token = "first-token";
  let observedToken: string | undefined;
  class FakeContext {
    sampleRate = 16000; destination = {};
    async resume() {} async close() {}
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, set onaudioprocess(fn: (event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) { processAudio = fn; } }; }
  }
  const previousFetch = globalThis.fetch;
  replace("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  replace("AudioContext", FakeContext);
  globalThis.fetch = async () => Response.json({ text: "да верно" });
  try {
    const session = new VoiceSession(() => {}, async (_text, captured) => { observedToken = captured; return undefined; }, () => {}, "normal", () => token);
    await session.start();
    assert(processAudio);
    const frame = (value: number) => processAudio!({ inputBuffer: { getChannelData: () => new Float32Array(1024).fill(value) } });
    frame(0.1); token = "new-token";
    for (let i = 0; i < 4; i++) frame(0.1);
    for (let i = 0; i < 20; i++) frame(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(observedToken, "first-token");
    session.stop();
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, desc] of originals) { if (desc) Object.defineProperty(globalThis, key, desc); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("plays every part of a long assistant response in order", async () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  class FakeContext {
    sampleRate = 16000; destination = {};
    async resume() {} async close() {}
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: undefined }; }
  }
  const audios: FakeAudio[] = [];
  class FakeAudio {
    paused = true; onended: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() { audios.push(this); }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
  }
  const previousFetch = globalThis.fetch;
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  const requested: number[] = [];
  replace("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  replace("AudioContext", FakeContext); replace("Audio", FakeAudio);
  URL.createObjectURL = () => "blob:test"; URL.revokeObjectURL = () => {};
  globalThis.fetch = async (_url, init) => { requested.push(JSON.parse(String(init?.body)).part); return new Response(new Uint8Array([1, 2, 3]), { headers: { "X-TTS-Parts": "2" } }); };
  try {
    const session = new VoiceSession(() => {}, async () => undefined, () => {});
    await session.start(); await session.speak("fake-message");
    assert.deepEqual(requested, [0]);
    audios[0].onended?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(requested, [0, 1]);
    assert.equal(audios[1].paused, false);
    audios[1].onended?.();
    assert.equal(audios[1].paused, true);
    session.stop();
  } finally {
    globalThis.fetch = previousFetch; URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke;
    for (const [key, desc] of originals) { if (desc) Object.defineProperty(globalThis, key, desc); else Reflect.deleteProperty(globalThis, key); }
  }
});
