/**
 * @phantomguard/cli-toolkit
 *
 * The `phantomguard` command as a library, so it can be driven from tests or other tools.
 */
export { parseCli } from './args.js';
export type { Command, ParsedCli } from './args.js';
export type { CliIo, StdinResult } from './io.js';
export { USAGE, main } from './main.js';
export { renderJson } from './render/json.js';
export { renderPretty } from './render/pretty.js';
export { renderSarif } from './render/sarif.js';
export { createPalette } from './render/colors.js';
export type { Palette } from './render/colors.js';
export { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK } from './types.js';
export type { FailOn, InputError, OutputFormat, ScanResult } from './types.js';
