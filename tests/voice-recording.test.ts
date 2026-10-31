import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceRecording } from "../src/lib/voice-recording.ts";

test("one-shot recording releases the microphone and returns recognized text for review", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const oldFetch = globalThis.fetch;
  let stopped = false;
  let processor: { onaudioprocess?: (event: { inputBuffer: { getChannelData: () => Float32Array } }) => void; connect: () => void; disconnect: () => void };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) } } });
  class FakeAudioContext {
    sampleRate = 16000;
    state = "running";
    destination = {};
    async resume() {}
    async close() { this.state = "closed"; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { processor = { connect() {}, disconnect() {} }; return processor; }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudioContext });
  globalThis.fetch = async (_url, init) => {
    assert(init?.body instanceof Blob);
    assert.equal(init.body.size, 8192);
    assert.equal(stopped, true);
    return Response.json({ text: "создай задачу" });
  };
  try {
    const recording = new VoiceRecording(() => assert.fail("unexpected limit"));
    assert.equal(await recording.start(), true);
    processor!.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) } });
    assert.equal(await recording.finish(), "создай задачу");
    assert.equal(stopped, true);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    if (oldContext) Object.defineProperty(globalThis, "AudioContext", oldContext); else Reflect.deleteProperty(globalThis, "AudioContext");
    globalThis.fetch = oldFetch;
  }
});
