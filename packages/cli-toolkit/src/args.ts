import { parseArgs } from 'node:util';
import type { ConfigFormat } from '@phantomguard/core-engine';
import { CONFIG_FORMATS, FAIL_ON_VALUES, OUTPUT_FORMATS } from './types.js';
import type { FailOn, OutputFormat } from './types.js';

export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | {
      readonly kind: 'scan';
      readonly paths: readonly string[];
      readonly format: ConfigFormat | undefined;
      readonly output: OutputFormat;
      readonly failOn: FailOn;
    }
  | {
      readonly kind: 'exorcise';
      readonly paths: readonly string[];
      readonly format: ConfigFormat | undefined;
    };

export type ParsedCli =
  { readonly ok: true; readonly command: Command } | { readonly ok: false; readonly error: string };

const fail = (error: string): ParsedCli => ({ ok: false, error });

function asConfigFormat(value: string): ConfigFormat | undefined {
  return CONFIG_FORMATS.find((format) => format === value);
}

function asOutputFormat(value: string): OutputFormat | undefined {
  return OUTPUT_FORMATS.find((format) => format === value);
}

function asFailOn(value: string): FailOn | undefined {
  const lower = value.toLowerCase();
  if (!FAIL_ON_VALUES.includes(lower)) {
    return undefined;
  }
  switch (lower) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    case 'info':
      return 'INFO';
    default:
      return 'none';
  }
}

/** Parse `argv` (without the node and script entries) into a command, or explain what is wrong. */
export function parseCli(argv: readonly string[]): ParsedCli {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', short: 'f' },
        output: { type: 'string', short: 'o' },
        'fail-on': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    // Node appends a long hint about "--" to its message; the first sentence is enough.
    const message = error instanceof Error ? error.message : 'invalid arguments';
    return fail(message.split('. To specify')[0] ?? message);
  }

  const { values, positionals } = parsed;
  if (values.help === true) {
    return { ok: true, command: { kind: 'help' } };
  }
  if (values.version === true) {
    return { ok: true, command: { kind: 'version' } };
  }

  const [name, ...paths] = positionals;
  if (name === undefined) {
    return fail('missing command: expected "scan" or "exorcise"');
  }
  if (name === 'help') {
    return { ok: true, command: { kind: 'help' } };
  }
  if (name !== 'scan' && name !== 'exorcise') {
    return fail(`unknown command "${name}": expected "scan" or "exorcise"`);
  }
  if (paths.length === 0) {
    return fail(`"${name}" needs at least one path (use "-" to read standard input)`);
  }
  if (paths.filter((path) => path === '-').length > 1) {
    return fail('standard input ("-") can be used only once');
  }

  let format: ConfigFormat | undefined;
  if (values.format !== undefined) {
    format = asConfigFormat(values.format);
    if (format === undefined) {
      return fail(`invalid --format "${values.format}": expected ${CONFIG_FORMATS.join(', ')}`);
    }
  }

  if (name === 'exorcise') {
    if (values.output !== undefined || values['fail-on'] !== undefined) {
      return fail('"exorcise" accepts only --format; --output and --fail-on belong to "scan"');
    }
    return { ok: true, command: { kind: 'exorcise', paths, format } };
  }

  let output: OutputFormat = 'pretty';
  if (values.output !== undefined) {
    const chosen = asOutputFormat(values.output);
    if (chosen === undefined) {
      return fail(`invalid --output "${values.output}": expected ${OUTPUT_FORMATS.join(', ')}`);
    }
    output = chosen;
  }

  let failOn: FailOn = 'HIGH';
  if (values['fail-on'] !== undefined) {
    const chosen = asFailOn(values['fail-on']);
    if (chosen === undefined) {
      return fail(
        `invalid --fail-on "${values['fail-on']}": expected ${FAIL_ON_VALUES.join(', ')}`,
      );
    }
    failOn = chosen;
  }

  return { ok: true, command: { kind: 'scan', paths, format, output, failOn } };
}
