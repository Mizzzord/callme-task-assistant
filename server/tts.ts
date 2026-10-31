export function splitSpeechText(text: string, limit = 900): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let end = remaining.lastIndexOf(" ", limit - 1) + 1;
    if (end < limit / 2) end = limit;
    if (end < remaining.length && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) parts.push(remaining);
  return parts;
}
