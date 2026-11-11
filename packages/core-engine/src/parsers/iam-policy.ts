import type { HauntedResource } from '../contracts/haunted-resource.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { Diagnostic } from '../contracts/scan.js';
import { isJsonObject } from '../util/attributes.js';
import { positionAt, printable } from '../util/text.js';
import { firstJsonSyntaxError } from './json-syntax.js';
import { MAX_JSON_DEPTH } from './types.js';
import type { ConfigParser, ParseResult } from './types.js';

interface JsonStructure {
  readonly maxDepth: number;
  /** For each array nested directly in the root object: the start line of each object element. */
  readonly arrayElementLines: readonly (readonly number[])[];
  readonly lineCount: number;
}

/**
 * One linear pass over the text. Tracks nesting depth (to enforce the depth
 * limit before JSON.parse runs) and the start line of every object that sits in
 * an array directly inside the root object (to locate policy statements).
 * Stops early once the depth limit is exceeded.
 */
function scanStructure(text: string): JsonStructure {
  const stack: Array<'{' | '['> = [];
  const groups: number[][] = [];
  let maxDepth = 0;
  let line = 1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '\n') {
      line += 1;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      const depth = stack.length + 1;
      if (char === '[' && depth === 2 && stack[0] === '{') {
        groups.push([]);
      } else if (char === '{' && depth === 3 && stack[0] === '{' && stack[1] === '[') {
        groups[groups.length - 1]?.push(line);
      }
      stack.push(char);
      maxDepth = Math.max(maxDepth, depth);
      if (maxDepth > MAX_JSON_DEPTH) {
        break;
      }
    } else if (char === '}' || char === ']') {
      stack.pop();
    }
  }
  return { maxDepth, arrayElementLines: groups, lineCount: line };
}

function failure(diagnostic: Diagnostic): ParseResult {
  return { format: 'iam-policy', resources: [], diagnostics: [diagnostic] };
}

function parse(text: string): ParseResult {
  const structure = scanStructure(text);
  if (structure.maxDepth > MAX_JSON_DEPTH) {
    return failure({
      code: 'PG-PARSE-DEPTH',
      level: 'error',
      message: `JSON is nested deeper than ${String(MAX_JSON_DEPTH)} levels, so it was not parsed.`,
    });
  }

  const syntaxError = firstJsonSyntaxError(text);
  if (syntaxError !== undefined) {
    const { line, column } = positionAt(text, syntaxError);
    return failure({
      code: 'PG-PARSE-SYNTAX',
      level: 'error',
      message:
        syntaxError >= text.length
          ? 'The JSON ends unexpectedly.'
          : `Unexpected character "${printable(text.charAt(syntaxError), 4)}" in JSON.`,
      line,
      column,
    });
  }

  let parsed: JsonValue;
  try {
    // JSON.parse creates "__proto__" as an ordinary own property, so hostile keys stay inert.
    parsed = JSON.parse(text) as JsonValue;
  } catch {
    // Unreachable for text that passed the syntax check, but a parser must never throw.
    return failure({
      code: 'PG-PARSE-SYNTAX',
      level: 'error',
      message: 'The text is not valid JSON.',
      line: 1,
      column: 1,
    });
  }

  if (!isJsonObject(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'Statement')) {
    return failure({
      code: 'PG-PARSE-SHAPE',
      level: 'warning',
      message: 'The JSON is not an IAM policy document: the top-level object has no "Statement".',
      line: 1,
      column: 1,
    });
  }

  const statement = parsed['Statement'];
  const statements: readonly JsonValue[] = Array.isArray(statement)
    ? (statement as readonly JsonValue[])
    : statement === undefined
      ? []
      : [statement];

  // Patches address statements by index, so the normalized document always uses an array.
  const document: JsonObject = Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, key === 'Statement' ? statements : value]),
  );

  const lines = Array.isArray(statement)
    ? structure.arrayElementLines.find((group) => group.length === statements.length)
    : undefined;

  const resource: HauntedResource = {
    id: 'aws_iam_policy.policy',
    kind: 'aws_iam_policy',
    name: 'policy',
    provider: 'aws',
    origin: {
      mode: 'custom-config',
      format: 'iam-policy',
      startLine: 1,
      endLine: structure.lineCount,
    },
    attributes: { document, ...(lines === undefined ? {} : { statementLines: [...lines] }) },
  };
  return { format: 'iam-policy', resources: [resource], diagnostics: [] };
}

function detect(text: string): number {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) {
    return 0;
  }
  // Two literal substring checks: linear, no regular expression on user text.
  if (!trimmed.includes('"Statement"')) {
    return 0;
  }
  return trimmed.includes('"Effect"') ? 0.95 : 0.8;
}

export const iamPolicyParser: ConfigParser = {
  format: 'iam-policy',
  label: 'IAM policy (JSON)',
  detect,
  parse,
};
