import { parseCli } from './args.js';
import { runExorcise } from './commands/exorcise.js';
import { runScan } from './commands/scan.js';
import type { CliIo } from './io.js';
import { EXIT_ERROR, EXIT_OK } from './types.js';
import { readVersion } from './version.js';

export const USAGE = `PhantomGuard: scan Terraform, Dockerfiles and IAM policies for dangerous configuration.

Usage:
  phantomguard scan <path>... [options]
  phantomguard exorcise <path>... [options]

A path is a file, a directory (searched recursively), or "-" for standard input.

Options:
  -f, --format <format>   terraform | dockerfile | iam-policy
                          (default: detect from the content)
  -o, --output <output>   pretty | json | sarif       (scan only, default: pretty)
      --fail-on <level>   critical | high | medium | low | info | none
                          (scan only, default: high)
  -h, --help              show this help
  -v, --version           show the version

Exit codes:
  0  no finding at or above --fail-on
  1  at least one finding at or above --fail-on
  2  usage error, an unreadable input, or an input that could not be analyzed

"exorcise" prints the fix PhantomGuard proposes for each finding as a unified diff.
It never modifies a file.
`;

/**
 * Run the CLI against `argv` (without the node and script entries) and return the exit code.
 * Everything external goes through `io`, so tests can drive it without a process.
 */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseCli(argv);
  if (!parsed.ok) {
    io.stderr(`phantomguard: ${parsed.error}\nTry "phantomguard --help".\n`);
    return EXIT_ERROR;
  }

  const { command } = parsed;
  switch (command.kind) {
    case 'help':
      io.stdout(USAGE);
      return EXIT_OK;
    case 'version':
      io.stdout(`${readVersion()}\n`);
      return EXIT_OK;
    case 'scan':
      return runScan(command, io);
    case 'exorcise':
      return runExorcise(command, io);
  }
}
