import type { Diagnostic } from '../contracts/scan.js';
import { printable } from '../util/text.js';
import { MAX_JSON_DEPTH } from './types.js';

/** A parsed HCL expression. Anything that cannot be evaluated statically is kept as source text. */
export type HclValue =
  | { readonly kind: 'string'; readonly value: string; readonly interpolated: boolean }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'null' }
  | { readonly kind: 'tuple'; readonly items: readonly HclValue[] }
  | { readonly kind: 'object'; readonly entries: readonly HclEntry[] }
  | {
      readonly kind: 'call';
      readonly name: string;
      readonly args: readonly HclValue[];
      readonly text: string;
    }
  | { readonly kind: 'opaque'; readonly text: string };

export interface HclEntry {
  readonly key: string;
  readonly value: HclValue;
}

export interface HclAttribute {
  readonly name: string;
  readonly value: HclValue;
  /** 1-based line of the attribute name. */
  readonly line: number;
}

export interface HclBlock {
  readonly type: string;
  readonly labels: readonly string[];
  readonly attributes: readonly HclAttribute[];
  readonly blocks: readonly HclBlock[];
  /** 1-based line of the block type. */
  readonly line: number;
  /** 1-based line of the closing brace (or of the last line read when it is missing). */
  readonly endLine: number;
}

export interface HclDocument {
  readonly blocks: readonly HclBlock[];
  readonly diagnostics: readonly Diagnostic[];
}

type TokenKind = 'ident' | 'string' | 'number' | 'heredoc' | 'punct' | 'newline' | 'eof';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  /** Decoded content of a string, or the body of a heredoc. */
  readonly value: string;
  readonly interpolated: boolean;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

/** Longest source text kept for a value that is stored as opaque. */
const MAX_OPAQUE_TEXT = 4096;

const TWO_CHAR_OPERATORS: ReadonlySet<string> = new Set(['==', '!=', '<=', '>=', '&&', '||', '=>']);

const isDigit = (char: string): boolean => char >= '0' && char <= '9';
const isIdentStart = (char: string): boolean =>
  (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
const isIdentPart = (char: string): boolean => isIdentStart(char) || isDigit(char) || char === '-';
const isBlank = (char: string): boolean => char === ' ' || char === '\t' || char === '\r';

function lineEnd(text: string, from: number): number {
  const newline = text.indexOf('\n', from);
  return newline === -1 ? text.length : newline;
}

function decodeEscapes(raw: string): string {
  if (!raw.includes('\\')) {
    return raw;
  }
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw.charAt(i);
    if (char !== '\\') {
      out += char;
      continue;
    }
    i += 1;
    const escaped = raw.charAt(i);
    switch (escaped) {
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'u':
      case 'U': {
        const length = escaped === 'u' ? 4 : 8;
        const hex = raw.slice(i + 1, i + 1 + length);
        const code = hex.length === length && /^[0-9a-fA-F]+$/.test(hex) ? parseInt(hex, 16) : -1;
        if (code >= 0 && code <= 0x10ffff) {
          out += String.fromCodePoint(code);
          i += length;
        } else {
          out += escaped;
        }
        break;
      }
      default:
        out += escaped;
    }
  }
  return out;
}

interface QuotedScan {
  readonly end: number;
  readonly interpolated: boolean;
  readonly closed: boolean;
}

/**
 * Scan a quoted string that starts at `open`, following `${ ... }` and `%{ ... }`
 * sequences so a quote inside an interpolation does not end the string. A raw newline
 * ends the scan: an unterminated string must not swallow the rest of the file.
 */
function scanQuoted(text: string, open: number): QuotedScan {
  const modes: Array<'string' | 'interpolation'> = ['string'];
  const braces: number[] = [0];
  let interpolated = false;
  let i = open + 1;

  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\n') {
      return { end: i, interpolated, closed: false };
    }
    const mode = modes[modes.length - 1];
    if (mode === 'string') {
      if (char === '\\') {
        i += text.charAt(i + 1) === '\n' ? 1 : 2;
        continue;
      }
      if (char === '"') {
        modes.pop();
        braces.pop();
        i += 1;
        if (modes.length === 0) {
          return { end: i, interpolated, closed: true };
        }
        continue;
      }
      if (char === '$' || char === '%') {
        if (text.charAt(i + 1) === char && text.charAt(i + 2) === '{') {
          i += 3; // "$${" and "%%{" are escapes for a literal "${" and "%{"
          continue;
        }
        if (text.charAt(i + 1) === '{') {
          modes.push('interpolation');
          braces.push(0);
          interpolated = true;
          i += 2;
          continue;
        }
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      modes.push('string');
      braces.push(0);
    } else if (char === '{') {
      braces[braces.length - 1] = (braces[braces.length - 1] ?? 0) + 1;
    } else if (char === '}') {
      const depth = braces[braces.length - 1] ?? 0;
      if (depth === 0) {
        modes.pop();
        braces.pop();
      } else {
        braces[braces.length - 1] = depth - 1;
      }
    }
    i += 1;
  }
  return { end: text.length, interpolated, closed: false };
}

interface HeredocScan {
  readonly end: number;
  readonly body: string;
  readonly interpolated: boolean;
  readonly closed: boolean;
}

/** Scan `<<MARK`, `<<-MARK` and the lines up to the closing marker. Undefined when `<<` is not a heredoc. */
function scanHeredoc(text: string, at: number): HeredocScan | undefined {
  let i = at + 2;
  if (text.charAt(i) === '-') {
    i += 1;
  }
  const markerStart = i;
  if (!isIdentStart(text.charAt(i))) {
    return undefined;
  }
  while (isIdentPart(text.charAt(i))) {
    i += 1;
  }
  const marker = text.slice(markerStart, i);
  while (isBlank(text.charAt(i))) {
    i += 1;
  }
  if (i < text.length && text.charAt(i) !== '\n') {
    return undefined;
  }

  const bodyStart = Math.min(i + 1, text.length);
  let lineBegin = bodyStart;
  while (lineBegin < text.length) {
    const end = lineEnd(text, lineBegin);
    if (text.slice(lineBegin, end).trim() === marker) {
      const body = text.slice(bodyStart, Math.max(bodyStart, lineBegin - 1));
      return { end, body, interpolated: body.includes('${') || body.includes('%{'), closed: true };
    }
    lineBegin = end + 1;
  }
  const body = text.slice(bodyStart);
  return {
    end: text.length,
    body,
    interpolated: body.includes('${') || body.includes('%{'),
    closed: false,
  };
}

function syntax(message: string, line: number, column: number): Diagnostic {
  return { code: 'PG-PARSE-SYNTAX', level: 'warning', message, line, column };
}

function tokenize(text: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  if (text.charCodeAt(0) === 0xfeff) {
    i = 1;
    lineStart = 1;
  }

  const advance = (end: number): void => {
    for (let k = i; k < end; k += 1) {
      if (text.charCodeAt(k) === 10) {
        line += 1;
        lineStart = k + 1;
      }
    }
    i = end;
  };

  const emit = (kind: TokenKind, end: number, value = '', interpolated = false): void => {
    const start = i;
    const startLine = line;
    const column = start - lineStart + 1;
    advance(end);
    tokens.push({
      kind,
      text: text.slice(start, end),
      value,
      interpolated,
      start,
      end,
      line: startLine,
      column,
    });
  };

  while (i < text.length) {
    const char = text.charAt(i);
    if (isBlank(char)) {
      i += 1;
    } else if (char === '\n') {
      emit('newline', i + 1);
    } else if (char === '#' || (char === '/' && text.charAt(i + 1) === '/')) {
      advance(lineEnd(text, i));
    } else if (char === '/' && text.charAt(i + 1) === '*') {
      const close = text.indexOf('*/', i + 2);
      if (close === -1) {
        diagnostics.push(syntax('A comment is never closed.', line, i - lineStart + 1));
        advance(text.length);
      } else {
        advance(close + 2);
      }
    } else if (char === '"') {
      const scan = scanQuoted(text, i);
      if (!scan.closed) {
        diagnostics.push(syntax('A string is never closed.', line, i - lineStart + 1));
      }
      const raw = text.slice(i + 1, scan.closed ? scan.end - 1 : scan.end);
      emit('string', scan.end, scan.interpolated ? raw : decodeEscapes(raw), scan.interpolated);
    } else if (isDigit(char)) {
      let j = i;
      while (isDigit(text.charAt(j))) {
        j += 1;
      }
      if (text.charAt(j) === '.' && isDigit(text.charAt(j + 1))) {
        j += 1;
        while (isDigit(text.charAt(j))) {
          j += 1;
        }
      }
      if (text.charAt(j) === 'e' || text.charAt(j) === 'E') {
        let k = j + 1;
        if (text.charAt(k) === '+' || text.charAt(k) === '-') {
          k += 1;
        }
        if (isDigit(text.charAt(k))) {
          j = k;
          while (isDigit(text.charAt(j))) {
            j += 1;
          }
        }
      }
      emit('number', j);
    } else if (isIdentStart(char)) {
      let j = i + 1;
      while (isIdentPart(text.charAt(j))) {
        j += 1;
      }
      emit('ident', j);
    } else {
      const heredoc = char === '<' && text.charAt(i + 1) === '<' ? scanHeredoc(text, i) : undefined;
      if (heredoc !== undefined) {
        if (!heredoc.closed) {
          diagnostics.push(syntax('A heredoc is never closed.', line, i - lineStart + 1));
        }
        emit('heredoc', heredoc.end, heredoc.body, heredoc.interpolated);
      } else {
        emit('punct', i + (TWO_CHAR_OPERATORS.has(text.slice(i, i + 2)) ? 2 : 1));
      }
    }
  }

  tokens.push({
    kind: 'eof',
    text: '',
    value: '',
    interpolated: false,
    start: text.length,
    end: text.length,
    line,
    column: text.length - lineStart + 1,
  });
  return { tokens, diagnostics };
}

interface ParsedBody {
  readonly attributes: HclAttribute[];
  readonly blocks: HclBlock[];
  readonly endLine: number;
}

class HclParser {
  private pos = 0;
  private readonly eof: Token;

  constructor(
    private readonly text: string,
    private readonly tokens: readonly Token[],
    readonly diagnostics: Diagnostic[],
  ) {
    const last = tokens[tokens.length - 1];
    if (last === undefined) {
      throw new Error('The tokenizer always ends with an end-of-input token.');
    }
    this.eof = last;
  }

  parseDocument(): HclDocument {
    const body = this.parseBody(0, undefined);
    return { blocks: body.blocks, diagnostics: this.diagnostics };
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.eof;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') {
      this.pos += 1;
    }
    return token;
  }

  private isPunct(token: Token, char: string): boolean {
    return token.kind === 'punct' && token.text === char;
  }

  private warn(message: string, token: Token): void {
    this.diagnostics.push(syntax(message, token.line, token.column));
  }

  private describe(token: Token): string {
    if (token.kind === 'eof') {
      return 'the end of the input';
    }
    return token.kind === 'newline' ? 'the end of the line' : `"${printable(token.text, 20)}"`;
  }

  private skipNewlines(): void {
    while (this.peek().kind === 'newline') {
      this.pos += 1;
    }
  }

  /** Skip to the end of the line, keeping brackets balanced. Never consumes a closer that belongs to a parent. */
  private skipToLineEnd(): void {
    let depth = 0;
    for (;;) {
      const token = this.peek();
      if (token.kind === 'eof' || (token.kind === 'newline' && depth === 0)) {
        return;
      }
      if (token.kind === 'punct') {
        if (token.text === '{' || token.text === '[' || token.text === '(') {
          depth += 1;
        } else if (token.text === '}' || token.text === ']' || token.text === ')') {
          if (depth === 0) {
            return;
          }
          depth -= 1;
        }
      }
      this.pos += 1;
    }
  }

  /** Always consumes at least one token, so callers that loop are guaranteed to progress. */
  private recover(): void {
    this.next();
    this.skipToLineEnd();
  }

  /** After a `{` has been consumed, skip through its matching `}`. */
  private skipBalanced(): void {
    let depth = 1;
    while (depth > 0) {
      const token = this.peek();
      if (token.kind === 'eof') {
        return;
      }
      this.pos += 1;
      if (this.isPunct(token, '{')) {
        depth += 1;
      } else if (this.isPunct(token, '}')) {
        depth -= 1;
      }
    }
  }

  private parseBody(depth: number, opener: Token | undefined): ParsedBody {
    const attributes: HclAttribute[] = [];
    const blocks: HclBlock[] = [];
    let endLine = opener?.line ?? 1;

    for (;;) {
      this.skipNewlines();
      const token = this.peek();
      if (token.kind === 'eof') {
        if (opener !== undefined) {
          this.warn(`The block opened on line ${String(opener.line)} is never closed.`, token);
        }
        endLine = token.line;
        break;
      }
      if (this.isPunct(token, '}')) {
        this.next();
        if (opener !== undefined) {
          endLine = token.line;
          break;
        }
        this.warn('Unexpected "}".', token);
        continue;
      }
      if (token.kind === 'ident') {
        if (this.isPunct(this.peek(1), '=')) {
          attributes.push(this.parseAttribute(depth));
        } else {
          const block = this.parseBlock(depth);
          if (block !== undefined) {
            blocks.push(block);
          }
        }
        continue;
      }
      this.warn(`Unexpected ${this.describe(token)}.`, token);
      this.recover();
    }
    return { attributes, blocks, endLine };
  }

  private parseAttribute(depth: number): HclAttribute {
    const name = this.next();
    this.next();
    const value = this.parseExpression(depth + 1, true);
    return { name: name.text, value, line: name.line };
  }

  private parseBlock(depth: number): HclBlock | undefined {
    const type = this.next();
    const labels: string[] = [];
    for (;;) {
      const token = this.peek();
      if (token.kind === 'string') {
        labels.push(token.value);
      } else if (token.kind === 'ident') {
        labels.push(token.text);
      } else {
        break;
      }
      this.next();
    }
    const open = this.peek();
    if (!this.isPunct(open, '{')) {
      this.warn(
        `Expected "{" after "${printable(type.text, 40)}", found ${this.describe(open)}.`,
        open,
      );
      this.skipToLineEnd();
      return undefined;
    }
    this.next();
    if (depth >= MAX_JSON_DEPTH) {
      this.diagnostics.push({
        code: 'PG-PARSE-DEPTH',
        level: 'warning',
        message: `Blocks are nested deeper than ${String(MAX_JSON_DEPTH)} levels, so the rest of this block was skipped.`,
        line: type.line,
        column: type.column,
      });
      this.skipBalanced();
      return undefined;
    }
    const body = this.parseBody(depth + 1, open);
    return {
      type: type.text,
      labels,
      attributes: body.attributes,
      blocks: body.blocks,
      line: type.line,
      endLine: body.endLine,
    };
  }

  private atTerminator(stopAtNewline: boolean): boolean {
    if (!stopAtNewline) {
      this.skipNewlines();
    }
    const token = this.peek();
    if (token.kind === 'eof') {
      return true;
    }
    if (token.kind === 'newline') {
      return stopAtNewline;
    }
    return (
      token.kind === 'punct' &&
      (token.text === ',' || token.text === '}' || token.text === ']' || token.text === ')')
    );
  }

  /** Parse one expression. Anything that is not a plain literal, list, object or call becomes opaque source text. */
  private parseExpression(depth: number, stopAtNewline: boolean): HclValue {
    const startPos = this.pos;
    const mark = this.diagnostics.length;
    if (depth > MAX_JSON_DEPTH) {
      const token = this.peek();
      this.diagnostics.push({
        code: 'PG-PARSE-DEPTH',
        level: 'warning',
        message: `Values are nested deeper than ${String(MAX_JSON_DEPTH)} levels, so this one was kept as text.`,
        line: token.line,
        column: token.column,
      });
      return this.opaque(stopAtNewline);
    }
    const primary = this.parsePrimary(depth);
    if (primary !== undefined && this.atTerminator(stopAtNewline)) {
      return primary;
    }
    this.pos = startPos;
    this.diagnostics.length = mark;
    return this.opaque(stopAtNewline);
  }

  private parsePrimary(depth: number): HclValue | undefined {
    const token = this.peek();
    switch (token.kind) {
      case 'string':
      case 'heredoc':
        this.next();
        return { kind: 'string', value: token.value, interpolated: token.interpolated };
      case 'number': {
        this.next();
        const value = Number(token.text);
        return Number.isFinite(value)
          ? { kind: 'number', value }
          : { kind: 'opaque', text: token.text };
      }
      case 'ident':
        if (token.text === 'true' || token.text === 'false') {
          this.next();
          return { kind: 'bool', value: token.text === 'true' };
        }
        if (token.text === 'null') {
          this.next();
          return { kind: 'null' };
        }
        return this.isPunct(this.peek(1), '(') ? this.parseCall(depth) : undefined;
      case 'punct':
        if (token.text === '[') {
          return this.parseTuple(depth);
        }
        return token.text === '{' ? this.parseObject(depth) : undefined;
      default:
        return undefined;
    }
  }

  /** Consume tokens up to the end of the expression and keep their source text. */
  private opaque(stopAtNewline: boolean): HclValue {
    const first = this.peek();
    let lastEnd = first.start;
    let depth = 0;
    for (;;) {
      const token = this.peek();
      if (token.kind === 'eof') {
        break;
      }
      if (token.kind === 'newline') {
        if (depth === 0 && stopAtNewline) {
          break;
        }
        this.pos += 1;
        continue;
      }
      if (token.kind === 'punct') {
        if (token.text === '(' || token.text === '[' || token.text === '{') {
          depth += 1;
        } else if (token.text === ')' || token.text === ']' || token.text === '}') {
          if (depth === 0) {
            break;
          }
          depth -= 1;
        } else if (token.text === ',' && depth === 0) {
          break;
        }
      }
      lastEnd = token.end;
      this.pos += 1;
    }
    const raw = this.text.slice(first.start, lastEnd);
    return {
      kind: 'opaque',
      text: raw.length > MAX_OPAQUE_TEXT ? `${raw.slice(0, MAX_OPAQUE_TEXT)}…` : raw,
    };
  }

  private parseTuple(depth: number): HclValue {
    const open = this.next();
    const items: HclValue[] = [];
    for (;;) {
      this.skipNewlines();
      const token = this.peek();
      if (token.kind === 'eof') {
        this.warn(`The "[" on line ${String(open.line)} is never closed.`, token);
        break;
      }
      if (this.isPunct(token, ']')) {
        this.next();
        break;
      }
      if (this.isPunct(token, ',')) {
        this.next();
        continue;
      }
      const before = this.pos;
      const item = this.parseExpression(depth + 1, false);
      if (this.pos === before) {
        this.warn(`Unexpected ${this.describe(token)}.`, token);
        this.next();
      } else {
        items.push(item);
      }
    }
    return { kind: 'tuple', items };
  }

  private parseCall(depth: number): HclValue {
    const name = this.next();
    this.next();
    const args: HclValue[] = [];
    for (;;) {
      this.skipNewlines();
      const token = this.peek();
      if (token.kind === 'eof') {
        this.warn(`The "(" after "${printable(name.text, 40)}" is never closed.`, token);
        break;
      }
      if (this.isPunct(token, ')')) {
        this.next();
        break;
      }
      if (this.isPunct(token, ',')) {
        this.next();
        continue;
      }
      const before = this.pos;
      const arg = this.parseExpression(depth + 1, false);
      if (this.pos === before) {
        this.warn(`Unexpected ${this.describe(token)}.`, token);
        this.next();
      } else {
        args.push(arg);
      }
    }
    const endOffset = this.tokens[this.pos - 1]?.end ?? name.end;
    const raw = this.text.slice(name.start, endOffset);
    return {
      kind: 'call',
      name: name.text,
      args,
      text: raw.length > MAX_OPAQUE_TEXT ? `${raw.slice(0, MAX_OPAQUE_TEXT)}…` : raw,
    };
  }

  private parseObject(depth: number): HclValue {
    const open = this.next();
    const entries: HclEntry[] = [];
    for (;;) {
      this.skipNewlines();
      const token = this.peek();
      if (token.kind === 'eof') {
        this.warn(`The "{" on line ${String(open.line)} is never closed.`, token);
        break;
      }
      if (this.isPunct(token, '}')) {
        this.next();
        break;
      }
      if (this.isPunct(token, ',')) {
        this.next();
        continue;
      }
      const before = this.pos;
      const entry = this.parseEntry(depth);
      if (entry !== undefined) {
        entries.push(entry);
      }
      if (this.pos === before) {
        this.warn(`Unexpected ${this.describe(token)}.`, token);
        this.next();
      }
    }
    return { kind: 'object', entries };
  }

  private parseEntry(depth: number): HclEntry | undefined {
    const keyToken = this.peek();
    if (keyToken.kind !== 'ident' && keyToken.kind !== 'string' && keyToken.kind !== 'number') {
      return undefined;
    }
    this.next();
    const separator = this.peek();
    if (!this.isPunct(separator, '=') && !this.isPunct(separator, ':')) {
      this.warn(`Expected "=" after "${printable(keyToken.text, 40)}".`, separator);
      this.opaque(true);
      return undefined;
    }
    this.next();
    const key = keyToken.kind === 'string' ? keyToken.value : keyToken.text;
    return { key, value: this.parseExpression(depth + 1, true) };
  }
}

/**
 * Parse HCL (the Terraform configuration language) into blocks, attributes and values.
 *
 * Tolerant and total: it never throws, reports problems as warnings with a line and a column,
 * and keeps going. Expressions it cannot evaluate (references, operators, most functions)
 * become `opaque` values that hold their source text. One pass over the tokens, no
 * regular expression on user text except on short, bounded slices.
 */
export function parseHcl(text: string): HclDocument {
  const { tokens, diagnostics } = tokenize(text);
  return new HclParser(text, tokens, diagnostics).parseDocument();
}
