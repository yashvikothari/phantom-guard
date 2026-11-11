import { stat } from 'node:fs/promises';
import { MAX_INPUT_BYTES, supportedFormats } from '@phantomguard/core-engine';
import type { ConfigFormat } from '@phantomguard/core-engine';
import { discoverFiles, isPolicyContent, readInputFile } from './files.js';
import type { CliIo } from './io.js';
import type { InputError } from './types.js';

export const STDIN_LABEL = '<stdin>';

/** One piece of configuration text to analyze, with the name the user will recognize. */
export interface Input {
  readonly label: string;
  readonly text: string;
}

export interface Collected {
  readonly inputs: readonly Input[];
  readonly errors: readonly InputError[];
  /** Human notes for standard error (skipped files and the like). */
  readonly notes: readonly string[];
}

const FORMAT_NAMES: Readonly<Record<ConfigFormat, string>> = {
  terraform: 'Terraform',
  dockerfile: 'Dockerfile',
  'iam-policy': 'IAM policy',
};

/**
 * Turn the paths given on the command line into text to analyze.
 *
 * A file named on the command line is always read; a directory is searched for
 * supported files. Anything that cannot be read becomes an error entry and the
 * rest are still processed (Requirement 14.8). Finding nothing at all to scan is
 * an error too, so a pipeline never passes just because it looked at nothing.
 */
export async function collectInputs(
  paths: readonly string[],
  format: ConfigFormat | undefined,
  io: CliIo,
): Promise<Collected> {
  const inputs: Input[] = [];
  const errors: InputError[] = [];
  const notes: string[] = [];
  const supported = supportedFormats();

  for (const path of paths) {
    if (path === '-') {
      const result = await io.readStdin(MAX_INPUT_BYTES);
      if (result.ok) {
        inputs.push({ label: STDIN_LABEL, text: result.text });
      } else {
        errors.push({ path: STDIN_LABEL, message: result.error });
      }
      continue;
    }

    let isDirectory = false;
    try {
      isDirectory = (await stat(path)).isDirectory();
    } catch (error) {
      errors.push({ path, message: error instanceof Error ? error.message : 'cannot read path' });
      continue;
    }

    if (!isDirectory) {
      const file = await readInputFile(path);
      if (file.ok) {
        inputs.push({ label: path, text: file.text });
      } else {
        errors.push({ path, message: file.error });
      }
      continue;
    }

    const found = await discoverFiles(path, {
      format,
      supported,
      onError: (failedPath, message) => errors.push({ path: failedPath, message }),
    });
    for (const [skippedFormat, count] of found.skipped) {
      notes.push(
        `skipped ${String(count)} ${FORMAT_NAMES[skippedFormat]} file(s) under ${path}: no parser for that format is available yet`,
      );
    }
    if (found.truncated) {
      notes.push(`stopped after the first files under ${path}: too many files to scan`);
    }
    for (const file of found.files) {
      const read = await readInputFile(file);
      if (!read.ok) {
        errors.push({ path: file, message: read.error });
      } else if (file.toLowerCase().endsWith('.json') && !isPolicyContent(read.text)) {
        continue; // most JSON files are not IAM policies; skip them quietly
      } else {
        inputs.push({ label: file, text: read.text });
      }
    }
  }

  if (inputs.length === 0 && errors.length === 0) {
    errors.push({
      path: paths.join(' '),
      message: 'no supported files found (supported: Dockerfile, IAM policy JSON)',
    });
  }
  return { inputs, errors, notes };
}
