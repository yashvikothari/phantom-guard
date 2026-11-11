import { SEVERITY_ORDER, scanText } from '@phantomguard/core-engine';
import type { Severity } from '@phantomguard/core-engine';
import type { Command } from '../args.js';
import { collectInputs } from '../inputs.js';
import type { CliIo } from '../io.js';
import { colorEnabled, createPalette } from '../render/colors.js';
import { renderJson } from '../render/json.js';
import { renderPretty } from '../render/pretty.js';
import { renderSarif } from '../render/sarif.js';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK } from '../types.js';
import type { FailOn, InputError, ScanResult } from '../types.js';
import { readVersion } from '../version.js';

type ScanCommand = Extract<Command, { kind: 'scan' }>;

/** True when `severity` is at or above the `--fail-on` threshold. */
export function reachesThreshold(severity: Severity, threshold: FailOn): boolean {
  if (threshold === 'none') {
    return false;
  }
  return SEVERITY_ORDER.indexOf(severity) <= SEVERITY_ORDER.indexOf(threshold);
}

/**
 * `phantomguard scan`. Standard output carries only the report; notes go to standard
 * error, so `--output json` and `--output sarif` stay machine-readable.
 *
 * Exit code: 2 when any input could not be read or analyzed, otherwise 1 when a
 * finding reaches `--fail-on`, otherwise 0. An unanalyzed input outranks findings
 * because a pipeline must not trust a partial result.
 */
export async function runScan(command: ScanCommand, io: CliIo): Promise<number> {
  const collected = await collectInputs(command.paths, command.format, io);
  for (const note of collected.notes) {
    io.stderr(`phantomguard: ${note}\n`);
  }

  const results: ScanResult[] = collected.inputs.map((input) => ({
    path: input.label,
    report: scanText(input.text, command.format === undefined ? {} : { format: command.format }),
  }));

  // An input that produced an error Diagnostic (unknown format, syntax error, no parser) was not analyzed.
  const unanalyzed: InputError[] = results.flatMap(({ path, report }) =>
    report.diagnostics
      .filter((diagnostic) => diagnostic.level === 'error')
      .map((diagnostic) => ({ path, message: `${diagnostic.message} [${diagnostic.code}]` })),
  );
  const errors: readonly InputError[] = collected.errors;

  const version = readVersion();
  switch (command.output) {
    case 'json':
      io.stdout(renderJson(results, errors, version));
      break;
    case 'sarif':
      io.stdout(renderSarif(results, errors, version));
      break;
    case 'pretty':
      io.stdout(renderPretty(results, errors, createPalette(colorEnabled(io.stdoutIsTTY, io.env))));
      break;
  }

  if (errors.length > 0 || unanalyzed.length > 0) {
    return EXIT_ERROR;
  }
  const failing = results.some(({ report }) =>
    report.findings.some((finding) => reachesThreshold(finding.severity, command.failOn)),
  );
  return failing ? EXIT_FINDINGS : EXIT_OK;
}
