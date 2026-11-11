import type { ConfigFormat, HauntedResource } from '../contracts/haunted-resource.js';
import type { Diagnostic } from '../contracts/scan.js';

/** Largest input accepted, in UTF-8 bytes (Requirement 1.5). */
export const MAX_INPUT_BYTES = 1_048_576;

/** Deepest JSON nesting accepted (Requirement 12.5). */
export const MAX_JSON_DEPTH = 64;

export interface ParseResult {
  /** The format used. Absent when none could be determined. */
  readonly format?: ConfigFormat;
  readonly resources: readonly HauntedResource[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseOptions {
  /** Skip detection and use this format. */
  readonly format?: ConfigFormat;
  /** Override the input size limit (bytes). */
  readonly maxBytes?: number;
}

/**
 * A parser for one input format. Both methods must be pure and must not throw
 * for any string; `parseConfig` also guards against a parser bug.
 */
export interface ConfigParser {
  readonly format: ConfigFormat;
  /** Human-readable name used in messages and format selectors. */
  readonly label: string;
  /** Confidence from 0 (not this format) to 1 (certainly this format). */
  detect(text: string): number;
  parse(text: string): ParseResult;
}
