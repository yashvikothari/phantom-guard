import * as fc from 'fast-check';

/**
 * Fragments that make parsers work hard: JSON and Dockerfile syntax, control
 * characters, escapes, surrogate pairs, a BOM, and prototype-pollution keys.
 */
const FRAGMENTS: readonly string[] = [
  '{',
  '}',
  '[',
  ']',
  ',',
  ':',
  '"',
  '\\',
  '\\u00e9',
  '\\ud83d',
  '\n',
  '\r\n',
  '\t',
  ' ',
  '\u0000',
  '\u0001',
  '\u007f',
  '\u2028',
  '\ufeff',
  'é',
  '😀',
  '\ud800',
  'true',
  'false',
  'null',
  '0',
  '-1',
  '1e999',
  '"Statement"',
  '"Effect"',
  '"Allow"',
  '"Action"',
  '"*"',
  '"s3:*"',
  '"Resource"',
  '"Principal"',
  '"__proto__"',
  '"constructor"',
  '"prototype"',
  '{"Statement":[',
  '{"Effect":"Allow","Action":"*","Resource":"*"}',
  'FROM ',
  'FROM node:22',
  'AS build',
  'USER ',
  'USER root',
  'USER 0',
  'USER ${U}',
  'RUN ',
  'RUN <<EOF',
  'EOF',
  'CMD ["x"]',
  '# comment',
  '# escape=`',
  '\\\n',
  '`\n',
  'ARG V=1',
  'COPY . .',
  '--platform=x',
  'resource "aws_s3_bucket" "b" {',
  'provider "aws" {',
  'terraform {',
  '${',
  '}',
];

/** Arbitrary text assembled from hostile fragments. */
export const hostileText: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...FRAGMENTS), { maxLength: 40 })
  .map((parts) => parts.join(''));

/** Printable ASCII noise. */
export const noise: fc.Arbitrary<string> = fc.string({ maxLength: 120 });

/** Mix of both, so each property sees structured and unstructured input. */
export const anyText: fc.Arbitrary<string> = fc.oneof(hostileText, hostileText, noise);

const VALID_SEEDS: readonly string[] = [
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:*","Resource":"*"}]}',
  '{\n  "Statement": [\n    {"Effect": "Deny", "Action": ["a:b", "c:*"], "Resource": "*"}\n  ]\n}',
  'FROM node:22 AS build\nRUN npm ci\nFROM node:22\nUSER app\nCMD ["node","a.js"]\n',
  'FROM scratch\nRUN <<EOF\necho hi\nEOF\nUSER 0\n',
];

/** A valid document with a few random edits: most inputs are almost valid. */
export const mutatedSeed: fc.Arbitrary<string> = fc
  .record({
    seed: fc.constantFrom(...VALID_SEEDS),
    edits: fc.array(
      fc.record({
        at: fc.nat(200),
        kind: fc.constantFrom('delete', 'insert', 'truncate', 'replace'),
        piece: fc.constantFrom(...FRAGMENTS),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  })
  .map(({ seed, edits }) =>
    edits.reduce((text, edit) => {
      const at = edit.at % (text.length + 1);
      switch (edit.kind) {
        case 'delete':
          return text.slice(0, at) + text.slice(at + 1);
        case 'insert':
          return text.slice(0, at) + edit.piece + text.slice(at);
        case 'truncate':
          return text.slice(0, at);
        default:
          return text.slice(0, at) + edit.piece + text.slice(at + 1);
      }
    }, seed),
  );

/** Everything the parsers should survive. */
export const parserInput: fc.Arbitrary<string> = fc.oneof(anyText, mutatedSeed, mutatedSeed);
