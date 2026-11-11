/**
 * Strict RFC 8259 syntax check that reports WHERE the first error is.
 *
 * `JSON.parse` messages differ between engines and often carry no position, so
 * parsers use this check first to report the same exact line and column in every
 * browser and in Node. It is iterative (explicit stack, no recursion), linear
 * (one pass), and uses no regular expression.
 */

type Scan = { readonly end: number } | { readonly error: number };

type State = 'value' | 'valueOrEnd' | 'keyOrEnd' | 'key' | 'colon' | 'after' | 'done';

const isDigit = (char: string): boolean => char >= '0' && char <= '9';

const isHex = (char: string): boolean =>
  isDigit(char) || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F');

const isWhitespace = (char: string): boolean =>
  char === ' ' || char === '\t' || char === '\n' || char === '\r';

function scanString(text: string, start: number): Scan {
  let i = start + 1;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '"') {
      return { end: i + 1 };
    }
    if (char === '\\') {
      const next = text.charAt(i + 1);
      if (next === 'u') {
        for (let offset = 2; offset <= 5; offset += 1) {
          if (!isHex(text.charAt(i + offset))) {
            return { error: Math.min(i + offset, text.length) };
          }
        }
        i += 6;
      } else if (next !== '' && '"\\/bfnrt'.includes(next)) {
        i += 2;
      } else {
        return { error: Math.min(i + 1, text.length) };
      }
    } else if (char.charCodeAt(0) < 0x20) {
      return { error: i }; // raw control characters must be escaped
    } else {
      i += 1;
    }
  }
  return { error: text.length }; // unterminated string
}

function scanNumber(text: string, start: number): Scan {
  let i = start;
  if (text.charAt(i) === '-') {
    i += 1;
  }
  const first = text.charAt(i);
  if (first === '0') {
    i += 1;
  } else if (first >= '1' && first <= '9') {
    while (isDigit(text.charAt(i))) {
      i += 1;
    }
  } else {
    return { error: Math.min(i, text.length) };
  }
  if (text.charAt(i) === '.') {
    i += 1;
    if (!isDigit(text.charAt(i))) {
      return { error: Math.min(i, text.length) };
    }
    while (isDigit(text.charAt(i))) {
      i += 1;
    }
  }
  const exponent = text.charAt(i);
  if (exponent === 'e' || exponent === 'E') {
    i += 1;
    const sign = text.charAt(i);
    if (sign === '+' || sign === '-') {
      i += 1;
    }
    if (!isDigit(text.charAt(i))) {
      return { error: Math.min(i, text.length) };
    }
    while (isDigit(text.charAt(i))) {
      i += 1;
    }
  }
  return { end: i };
}

/**
 * Returns the 0-based offset of the first offending character (`text.length` when
 * the text ends too early), or undefined when `text` is one valid JSON value.
 */
export function firstJsonSyntaxError(text: string): number | undefined {
  const stack: Array<'{' | '['> = [];
  let state: State = 'value';
  let i = 0;

  /** State after a complete value: expect "," or a closer inside a container, else the end. */
  const afterValue = (): State => (stack.length === 0 ? 'done' : 'after');

  for (;;) {
    while (i < text.length && isWhitespace(text.charAt(i))) {
      i += 1;
    }
    if (i >= text.length) {
      return state === 'done' ? undefined : text.length;
    }
    const char = text.charAt(i);

    switch (state) {
      case 'done':
        return i; // trailing characters after the value
      case 'value':
      case 'valueOrEnd': {
        if (state === 'valueOrEnd' && char === ']') {
          stack.pop();
          i += 1;
          state = afterValue();
        } else if (char === '{') {
          stack.push('{');
          i += 1;
          state = 'keyOrEnd';
        } else if (char === '[') {
          stack.push('[');
          i += 1;
          state = 'valueOrEnd';
        } else if (char === '"') {
          const scanned = scanString(text, i);
          if ('error' in scanned) {
            return scanned.error;
          }
          i = scanned.end;
          state = afterValue();
        } else if (char === '-' || isDigit(char)) {
          const scanned = scanNumber(text, i);
          if ('error' in scanned) {
            return scanned.error;
          }
          i = scanned.end;
          state = afterValue();
        } else if (text.startsWith('true', i)) {
          i += 4;
          state = afterValue();
        } else if (text.startsWith('false', i)) {
          i += 5;
          state = afterValue();
        } else if (text.startsWith('null', i)) {
          i += 4;
          state = afterValue();
        } else {
          return i;
        }
        break;
      }
      case 'keyOrEnd':
      case 'key': {
        if (state === 'keyOrEnd' && char === '}') {
          stack.pop();
          i += 1;
          state = afterValue();
          break;
        }
        if (char !== '"') {
          return i;
        }
        const scanned = scanString(text, i);
        if ('error' in scanned) {
          return scanned.error;
        }
        i = scanned.end;
        state = 'colon';
        break;
      }
      case 'colon':
        if (char !== ':') {
          return i;
        }
        i += 1;
        state = 'value';
        break;
      case 'after': {
        const top = stack[stack.length - 1];
        if (char === ',') {
          i += 1;
          state = top === '{' ? 'key' : 'value';
        } else if ((char === '}' && top === '{') || (char === ']' && top === '[')) {
          stack.pop();
          i += 1;
          state = afterValue();
        } else {
          return i;
        }
        break;
      }
    }
  }
}
