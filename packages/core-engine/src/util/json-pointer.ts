import type { JsonValue } from '../contracts/json.js';

export type PointerResult =
  { readonly ok: true; readonly value: JsonValue } | { readonly ok: false; readonly error: string };

const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Split an RFC 6901 pointer into decoded tokens. Returns undefined for a malformed pointer. */
export function parsePointer(pointer: string): readonly string[] | undefined {
  if (pointer === '') {
    return [];
  }
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Encode one key or index as a pointer token. */
export function pointerToken(key: string | number): string {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Read the value at a pointer. Only own properties are followed, so prototype keys are inert. */
export function getAtPointer(root: JsonValue, pointer: string): PointerResult {
  const tokens = parsePointer(pointer);
  if (tokens === undefined) {
    return { ok: false, error: `invalid JSON pointer "${pointer}"` };
  }
  let node: JsonValue = root;
  for (const token of tokens) {
    if (Array.isArray(node)) {
      const items = node as readonly JsonValue[];
      const item = ARRAY_INDEX.test(token) ? items[Number(token)] : undefined;
      if (item === undefined) {
        return { ok: false, error: `path "${pointer}" does not exist` };
      }
      node = item;
    } else if (isRecord(node) && hasOwn(node, token)) {
      const member = node[token];
      if (member === undefined) {
        return { ok: false, error: `path "${pointer}" does not exist` };
      }
      node = member;
    } else {
      return { ok: false, error: `path "${pointer}" does not exist` };
    }
  }
  return { ok: true, value: node };
}

function setIn(
  node: JsonValue | undefined,
  tokens: readonly string[],
  index: number,
  value: JsonValue,
): JsonValue | undefined {
  if (index === tokens.length) {
    return value;
  }
  const token = tokens[index];
  if (token === undefined || node === undefined) {
    return undefined;
  }
  const isLast = index === tokens.length - 1;

  if (Array.isArray(node)) {
    const items = node as readonly JsonValue[];
    if (!ARRAY_INDEX.test(token)) {
      return undefined;
    }
    const position = Number(token);
    const current = items[position];
    if (current === undefined) {
      return undefined; // array indexes must already exist
    }
    const child = setIn(current, tokens, index + 1, value);
    if (child === undefined) {
      return undefined;
    }
    return items.map((item, itemIndex) => (itemIndex === position ? child : item));
  }

  if (isRecord(node)) {
    const exists = hasOwn(node, token);
    if (!exists && !isLast) {
      return undefined; // only the final member may be created
    }
    const child = setIn(exists ? node[token] : undefined, tokens, index + 1, value);
    if (child === undefined) {
      return undefined;
    }
    const entries = Object.entries(node);
    // Object.fromEntries defines own data properties: "__proto__" stays plain data.
    return exists
      ? Object.fromEntries(entries.map(([key, item]) => [key, key === token ? child : item]))
      : Object.fromEntries([...entries, [token, child]]);
  }

  return undefined;
}

/**
 * Return a copy of `root` with the value at `pointer` replaced (or, for the final
 * object member, created). Never mutates `root`.
 */
export function setAtPointer(root: JsonValue, pointer: string, value: JsonValue): PointerResult {
  const tokens = parsePointer(pointer);
  if (tokens === undefined) {
    return { ok: false, error: `invalid JSON pointer "${pointer}"` };
  }
  const next = setIn(root, tokens, 0, value);
  if (next === undefined) {
    return { ok: false, error: `path "${pointer}" does not exist` };
  }
  return { ok: true, value: next };
}
