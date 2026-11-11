/**
 * Make user-supplied text safe to embed in a message: control characters become `?`
 * (so hostile input cannot rewrite a terminal) and the length is capped.
 * Linear time, no regular expression.
 */
export function printable(value: string, max = 80): string {
  let out = '';
  let truncated = false;
  for (const char of value) {
    if (out.length >= max) {
      truncated = true;
      break;
    }
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? '?' : char;
  }
  return truncated ? `${out}…` : out;
}

/** 1-based line and column of a 0-based `offset` in `text`. An offset past the end maps to the end. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
  const end = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < end; i += 1) {
    if (text.charAt(i) === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

/** Length of `text` in UTF-8 bytes, without TextEncoder (not declared in a DOM-free, Node-free lib). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
