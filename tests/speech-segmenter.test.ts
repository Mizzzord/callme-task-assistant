import { test } from "node:test";
import assert from "node:assert/strict";
import { SpeechSegmenter } from "../src/lib/speech-segmenter.ts";

test("ignores brief noise and keeps the beginning of a spoken segment", () => {
  let candidates = 0;
  const vad = new SpeechSegmenter("normal", () => { candidates++; });
  const push = (amplitude: number) => vad.push(new Float32Array(1024).fill(amplitude));
  for (let i = 0; i < 8; i++) assert.equal(push(0.004), undefined);
  assert.equal(push(0.1), undefined);
  for (let i = 0; i < 20; i++) assert.equal(push(0), undefined);
  assert.equal(candidates, 1);
  for (let i = 0; i < 5; i++) assert.equal(push(0.08), undefined);
  let result: Int16Array | "too-long" | undefined;
  for (let i = 0; i < 20 && !result; i++) result = push(0);
  assert(result instanceof Int16Array);
  assert(result.some((sample) => sample > 1000));
  assert.equal(candidates, 2);
});
