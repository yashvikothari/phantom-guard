import { SEVERITY_ORDER, printable } from '@phantomguard/core-engine';
import type { Finding, Severity } from '@phantomguard/core-engine';
import type { InputError, ScanResult } from '../types.js';
import type { Palette } from './colors.js';

const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH    ',
  MEDIUM: 'MEDIUM  ',
  LOW: 'LOW     ',
  INFO: 'INFO    ',
};

/** Paths come from the user's filesystem or arguments; keep control characters out of the terminal. */
const safe = (text: string): string => printable(text, 200);

function describeLocation(label: string, finding: Finding): string {
  return finding.line === undefined ? safe(label) : `${safe(label)}:${String(finding.line)}`;
}

function renderFinding(label: string, finding: Finding, palette: Palette): string[] {
  const lines = [
    `  ${palette.severity(finding.severity, SEVERITY_LABEL[finding.severity])} ${palette.bold(finding.ruleId)}  ${finding.message}`,
    `           ${palette.dim(`${finding.resourceName} at ${describeLocation(label, finding)}`)}`,
  ];
  for (const reference of finding.references) {
    lines.push(
      `           ${palette.dim(`${reference.benchmark} ${reference.version} ${reference.control}`)}`,
    );
  }
  if (finding.patch !== undefined) {
    const review = finding.patch.reviewRequired ? ' (review required)' : '';
    lines.push(`           ${palette.green(`fix: ${finding.patch.title}${review}`)}`);
  } else if (finding.guidance !== undefined) {
    lines.push(`           ${palette.yellow(`manual: ${finding.guidance}`)}`);
  }
  return lines;
}

/** Human-readable report for a terminal. */
export function renderPretty(
  results: readonly ScanResult[],
  errors: readonly InputError[],
  palette: Palette,
): string {
  const out: string[] = [];

  for (const { path, report } of results) {
    out.push(
      palette.bold(safe(path)) +
        palette.dim(report.format === undefined ? '' : `  [${report.format}]`),
    );
    for (const diagnostic of report.diagnostics) {
      const where =
        diagnostic.line === undefined
          ? ''
          : ` (line ${String(diagnostic.line)}${diagnostic.column === undefined ? '' : `, column ${String(diagnostic.column)}`})`;
      const text = `  ${diagnostic.level}: ${diagnostic.message}${where} [${diagnostic.code}]`;
      out.push(diagnostic.level === 'error' ? palette.red(text) : palette.dim(text));
    }
    if (report.diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
      // Never let an input that could not be analyzed read as clean.
      out.push(`  ${palette.red('not analyzed')}`);
    } else if (report.findings.length === 0) {
      out.push(`  ${palette.green('no findings')}`);
    }
    for (const finding of report.findings) {
      out.push(...renderFinding(path, finding, palette));
    }
    out.push('');
  }

  for (const error of errors) {
    out.push(palette.red(`error: ${safe(error.path)}: ${safe(error.message)}`));
  }

  const total = results.reduce((sum, result) => sum + result.report.summary.total, 0);
  const totals = SEVERITY_ORDER.map((severity) =>
    results.reduce((sum, result) => sum + result.report.summary.bySeverity[severity], 0),
  );
  const breakdown = SEVERITY_ORDER.flatMap((severity, index) =>
    (totals[index] ?? 0) > 0 ? [`${String(totals[index])} ${severity.toLowerCase()}`] : [],
  );
  const failed =
    errors.length +
    results.filter(({ report }) =>
      report.diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    ).length;
  const scanned = `${String(results.length)} file${results.length === 1 ? '' : 's'} scanned`;
  const verdict =
    total === 0
      ? failed === 0
        ? palette.green('no findings')
        : 'no findings in the inputs that could be analyzed'
      : `${String(total)} finding${total === 1 ? '' : 's'} (${breakdown.join(', ')})`;
  out.push(
    failed === 0
      ? `${scanned}, ${verdict}`
      : `${scanned}, ${palette.red(`${String(failed)} could not be analyzed`)}, ${verdict}`,
  );
  return `${out.join('\n')}\n`;
}
