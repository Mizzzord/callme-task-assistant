import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSpeechText } from "../server/tts.ts";

test("long speech is split without dropping text or cutting a Unicode character", () => {
  const text = "слова ".repeat(250) + "😀".repeat(300) + " конец";
  const parts = splitSpeechText(text);
  assert(parts.length > 1);
  assert.equal(parts.join(""), text);
  for (const part of parts) {
    assert(part.length <= 900);
    assert(!/[\uD800-\uDBFF]$/.test(part));
    assert(!/^[\uDC00-\uDFFF]/.test(part));
  }
});
