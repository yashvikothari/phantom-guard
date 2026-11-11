import type { HauntedResource } from '../contracts/haunted-resource.js';
import type { JsonObject } from '../contracts/json.js';
import type { Diagnostic } from '../contracts/scan.js';
import { printable } from '../util/text.js';
import type { ConfigParser, ParseResult } from './types.js';

const KEYWORDS: ReadonlySet<string> = new Set([
  'ADD',
  'ARG',
  'CMD',
  'COPY',
  'ENTRYPOINT',
  'ENV',
  'EXPOSE',
  'FROM',
  'HEALTHCHECK',
  'LABEL',
  'MAINTAINER',
  'ONBUILD',
  'RUN',
  'SHELL',
  'STOPSIGNAL',
  'USER',
  'VOLUME',
  'WORKDIR',
]);

interface Instruction {
  readonly keyword: string;
  readonly args: string;
  /** 1-based line where the instruction starts. */
  readonly line: number;
}

interface Stage {
  readonly image: string;
  readonly name?: string;
  readonly fromLine: number;
  user?: string;
  userLine?: number;
  userUnresolved?: boolean;
}

const isSpace = (char: string): boolean => char === ' ' || char === '\t';

function splitLines(text: string): string[] {
  return text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** Escape character from a leading `# escape=` parser directive; backslash otherwise. */
function escapeCharacter(lines: readonly string[]): string {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('#')) {
      break; // directives are only recognized before the first non-comment line
    }
    const equals = line.indexOf('=');
    if (equals > 0 && line.slice(1, equals).trim().toLowerCase() === 'escape') {
      const value = line.slice(equals + 1).trim();
      if (value === '`' || value === '\\') {
        return value;
      }
    }
  }
  return '\\';
}

/** Heredoc delimiters opened by `<<WORD`, `<<-WORD`, `<<"WORD"` or `<<'WORD'` in a RUN, COPY or ADD. */
function heredocDelimiters(args: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const at = args.indexOf('<<', from);
    if (at === -1) {
      break;
    }
    let i = at + 2;
    if (args.charAt(i) === '-') {
      i += 1;
    }
    const quote = args.charAt(i) === '"' || args.charAt(i) === "'" ? args.charAt(i) : '';
    if (quote !== '') {
      i += 1;
    }
    const start = i;
    while (i < args.length && /[A-Za-z0-9_]/.test(args.charAt(i))) {
      i += 1;
    }
    if (i > start && /[A-Za-z_]/.test(args.charAt(start))) {
      found.push(args.slice(start, i));
    }
    from = Math.max(i, at + 2);
  }
  return found;
}

function tokenize(
  text: string,
  diagnostics: Diagnostic[],
): { instructions: Instruction[]; lineCount: number } {
  const lines = splitLines(text);
  const escape = escapeCharacter(lines);
  const instructions: Instruction[] = [];

  let i = 0;
  while (i < lines.length) {
    const first = lines[i] ?? '';
    const trimmed = first.trim();
    const lineNumber = i + 1;
    i += 1;
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    // Assemble continuation lines. Comment and blank lines inside a continuation are dropped.
    let joined = trimmed;
    while (joined.endsWith(escape)) {
      joined = joined.slice(0, -1).trimEnd();
      let next = lines[i];
      while (next !== undefined && (next.trim() === '' || next.trim().startsWith('#'))) {
        i += 1;
        next = lines[i];
      }
      if (next === undefined) {
        break;
      }
      i += 1;
      joined = `${joined} ${next.trim()}`;
    }

    let split = 0;
    while (split < joined.length && !isSpace(joined.charAt(split))) {
      split += 1;
    }
    const keyword = joined.slice(0, split).toUpperCase();
    const args = joined.slice(split).trim();

    if (!KEYWORDS.has(keyword)) {
      diagnostics.push({
        code: 'PG-PARSE-SYNTAX',
        level: 'warning',
        message: `Unknown Dockerfile instruction "${printable(joined.slice(0, split), 24)}"; the line was skipped.`,
        line: lineNumber,
        column: 1,
      });
      continue;
    }

    instructions.push({ keyword, args, line: lineNumber });

    if (keyword === 'RUN' || keyword === 'COPY' || keyword === 'ADD') {
      // A heredoc body is data, not instructions. Skip it up to each terminator line.
      for (const delimiter of heredocDelimiters(args)) {
        while (i < lines.length) {
          const body = (lines[i] ?? '').trim();
          i += 1;
          if (body === delimiter) {
            break;
          }
        }
      }
    }
  }
  return { instructions, lineCount: lines.length };
}

/** Parse `FROM [--flag=value ...] image [AS name]`. */
function parseFrom(args: string): { image: string; name?: string } | undefined {
  const parts = args.split(/[ \t]+/).filter((part) => part !== '' && !part.startsWith('--'));
  const image = parts[0];
  if (image === undefined) {
    return undefined;
  }
  const name = parts[1]?.toUpperCase() === 'AS' ? parts[2] : undefined;
  return name === undefined ? { image } : { image, name };
}

function parse(text: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const { instructions, lineCount } = tokenize(text, diagnostics);

  const stages: Stage[] = [];
  const byName = new Map<string, Stage>();

  for (const instruction of instructions) {
    if (instruction.keyword === 'FROM') {
      const from = parseFrom(instruction.args);
      if (from === undefined) {
        diagnostics.push({
          code: 'PG-PARSE-SYNTAX',
          level: 'warning',
          message: 'FROM needs an image name.',
          line: instruction.line,
          column: 1,
        });
        continue;
      }
      const stage: Stage = {
        image: from.image,
        ...(from.name === undefined ? {} : { name: from.name }),
        fromLine: instruction.line,
      };
      // A stage that starts FROM an earlier stage inherits that stage's user.
      const parent = byName.get(from.image.toLowerCase());
      if (parent !== undefined) {
        if (parent.user !== undefined) {
          stage.user = parent.user;
        }
        if (parent.userLine !== undefined) {
          stage.userLine = parent.userLine;
        }
        if (parent.userUnresolved === true) {
          stage.userUnresolved = true;
        }
      }
      stages.push(stage);
      if (from.name !== undefined) {
        byName.set(from.name.toLowerCase(), stage);
      }
    } else if (instruction.keyword === 'USER') {
      const stage = stages[stages.length - 1];
      if (stage === undefined) {
        continue; // USER before any FROM is not meaningful
      }
      const user = instruction.args.split(/[ \t]+/)[0] ?? '';
      stage.userLine = instruction.line;
      if (user.includes('$')) {
        delete stage.user;
        stage.userUnresolved = true;
      } else {
        stage.user = user;
        delete stage.userUnresolved;
      }
    }
  }

  const finalStage = stages[stages.length - 1];
  if (finalStage === undefined) {
    diagnostics.push({
      code: 'PG-PARSE-SYNTAX',
      level: 'warning',
      message: 'No FROM instruction found, so there is no image to analyze.',
      line: 1,
      column: 1,
    });
    return { format: 'dockerfile', resources: [], diagnostics };
  }

  const stageAttributes: JsonObject = {
    baseImage: finalStage.image,
    ...(finalStage.name === undefined ? {} : { name: finalStage.name }),
    fromLine: finalStage.fromLine,
    ...(finalStage.user === undefined ? {} : { user: finalStage.user }),
    ...(finalStage.userLine === undefined ? {} : { userLine: finalStage.userLine }),
    ...(finalStage.userUnresolved === true ? { userUnresolved: true } : {}),
  };

  const resource: HauntedResource = {
    id: 'container_image.dockerfile',
    kind: 'container_image',
    name: 'Dockerfile',
    provider: 'docker',
    origin: {
      mode: 'custom-config',
      format: 'dockerfile',
      startLine: finalStage.fromLine,
      endLine: Math.max(lineCount, finalStage.fromLine),
    },
    attributes: { stageCount: stages.length, finalStage: stageAttributes },
  };
  return { format: 'dockerfile', resources: [resource], diagnostics };
}

function detect(text: string): number {
  const lines = splitLines(text);
  let sawArg = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const keyword = (trimmed.split(/[ \t]+/)[0] ?? '').toUpperCase();
    if (keyword === 'FROM') {
      return sawArg ? 0.8 : 0.9;
    }
    if (keyword === 'ARG') {
      sawArg = true; // ARG may precede the first FROM
      continue;
    }
    return 0;
  }
  return 0;
}

export const dockerfileParser: ConfigParser = {
  format: 'dockerfile',
  label: 'Dockerfile',
  detect,
  parse,
};
