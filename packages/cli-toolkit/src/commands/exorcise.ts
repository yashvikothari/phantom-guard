import { printable, scanText } from '@phantomguard/core-engine';
import type { Finding } from '@phantomguard/core-engine';
import type { Command } from '../args.js';
import { collectInputs } from '../inputs.js';
import type { CliIo } from '../io.js';
import { colorEnabled, createPalette } from '../render/colors.js';
import type { Palette } from '../render/colors.js';
import { EXIT_ERROR, EXIT_OK } from '../types.js';

type ExorciseCommand = Extract<Command, { kind: 'exorcise' }>;

function colorDiff(diff: string, palette: Palette): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) {
        return palette.bold(line);
      }
      if (line.startsWith('+')) {
        return palette.green(line);
      }
      if (line.startsWith('-')) {
        return palette.red(line);
      }
      return line.startsWith('@@') ? palette.cyan(line) : line;
    })
    .join('\n');
}

function describe(path: string, finding: Finding, palette: Palette): string[] {
  const where = finding.line === undefined ? '' : `:${String(finding.line)}`;
  const header = `${palette.bold(printable(path, 200) + where)}  ${palette.severity(finding.severity, finding.severity)} ${finding.ruleId}`;
  const lines = [header, `  ${finding.message}`];

  if (finding.patch === undefined) {
    lines.push(
      `  ${palette.yellow('no automatic fix:')} ${finding.guidance ?? 'fix this by hand'}`,
      '',
    );
    return lines;
  }

  const review = finding.patch.reviewRequired ? palette.yellow(' (review required)') : '';
  lines.push(
    `  ${palette.green(finding.patch.title)}${review}`,
    `  ${finding.patch.rationale}`,
    '',
  );
  lines.push(colorDiff(finding.patch.preview.unifiedDiff, palette), '');
  return lines;
}

/**
 * `phantomguard exorcise`: print the patch PhantomGuard proposes for every finding, as a
 * unified diff. It never modifies a file (Requirement 15.1). Applying patches to source
 * text needs a per-format writer, which is tracked in tasks.md.
 */
export async function runExorcise(command: ExorciseCommand, io: CliIo): Promise<number> {
  const palette = createPalette(colorEnabled(io.stdoutIsTTY, io.env));
  const collected = await collectInputs(command.paths, command.format, io);
  for (const note of collected.notes) {
    io.stderr(`phantomguard: ${note}\n`);
  }

  let proposals = 0;
  let manual = 0;
  let unanalyzed = 0;
  const out: string[] = [];

  for (const input of collected.inputs) {
    const report = scanText(
      input.text,
      command.format === undefined ? {} : { format: command.format },
    );
    for (const diagnostic of report.diagnostics) {
      if (diagnostic.level === 'error') {
        unanalyzed += 1;
        io.stderr(
          `phantomguard: ${printable(input.label, 200)}: ${diagnostic.message} [${diagnostic.code}]\n`,
        );
      }
    }
    for (const finding of report.findings) {
      out.push(...describe(input.label, finding, palette));
      if (finding.patch === undefined) {
        manual += 1;
      } else {
        proposals += 1;
      }
    }
  }

  for (const error of collected.errors) {
    io.stderr(`phantomguard: ${printable(error.path, 200)}: ${printable(error.message, 200)}\n`);
  }

  out.push(
    `${String(proposals)} proposed fix${proposals === 1 ? '' : 'es'}, ${String(manual)} finding${manual === 1 ? '' : 's'} to fix by hand. No file was modified.`,
  );
  io.stdout(`${out.join('\n')}\n`);
  return collected.errors.length > 0 || unanalyzed > 0 ? EXIT_ERROR : EXIT_OK;
}
