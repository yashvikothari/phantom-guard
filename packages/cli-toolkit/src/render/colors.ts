import type { Severity } from '@phantomguard/core-engine';

export interface Palette {
  readonly red: (text: string) => string;
  readonly green: (text: string) => string;
  readonly yellow: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly bold: (text: string) => string;
  readonly severity: (severity: Severity, text: string) => string;
}

const wrap =
  (open: number, close: number) =>
  (text: string): string =>
    `\u001b[${String(open)}m${text}\u001b[${String(close)}m`;

const identity = (text: string): string => text;

/**
 * ANSI colors, or plain text. Color is on only when standard output is a terminal
 * and NO_COLOR is unset (Requirement 14.7, https://no-color.org).
 */
export function createPalette(enabled: boolean): Palette {
  if (!enabled) {
    return {
      red: identity,
      green: identity,
      yellow: identity,
      cyan: identity,
      dim: identity,
      bold: identity,
      severity: (_severity, text) => text,
    };
  }
  const red = wrap(31, 39);
  const yellow = wrap(33, 39);
  const cyan = wrap(36, 39);
  const dim = wrap(2, 22);
  return {
    red,
    green: wrap(32, 39),
    yellow,
    cyan,
    dim,
    bold: wrap(1, 22),
    severity: (severity, text) => {
      switch (severity) {
        case 'CRITICAL':
        case 'HIGH':
          return red(text);
        case 'MEDIUM':
          return yellow(text);
        case 'LOW':
          return cyan(text);
        case 'INFO':
          return dim(text);
      }
    },
  };
}

/** True when color should be used: a TTY and no NO_COLOR (an empty NO_COLOR counts as unset). */
export function colorEnabled(
  stdoutIsTTY: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const noColor = env['NO_COLOR'];
  return stdoutIsTTY && (noColor === undefined || noColor === '');
}
