import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_INPUT_BYTES, detectFormat } from '@phantomguard/core-engine';
import type { ConfigFormat } from '@phantomguard/core-engine';

/** Directories that never hold configuration worth scanning. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.terraform',
  '.next',
  'dist',
  'build',
  'coverage',
]);

const MAX_DEPTH = 20;
export const MAX_FILES = 5000;

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Which formats a file NAME could hold. Content decides the rest. */
export function candidateFormats(fileName: string): readonly ConfigFormat[] {
  const name = fileName.toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) {
    return ['dockerfile'];
  }
  if (name.endsWith('.tf')) {
    return ['terraform'];
  }
  if (name.endsWith('.json')) {
    return ['iam-policy'];
  }
  return [];
}

export interface Discovery {
  /** Paths in the form the user will recognize: the directory they typed, joined with the relative path. */
  readonly files: readonly string[];
  /** Files skipped because their format has no parser yet, keyed by format. */
  readonly skipped: ReadonlyMap<ConfigFormat, number>;
  readonly truncated: boolean;
}

/**
 * List the supported files under `root`, in a stable order.
 * Symbolic links are never followed (no loops, no escaping the tree), and depth
 * and file count are bounded.
 */
export async function discoverFiles(
  root: string,
  options: {
    readonly format: ConfigFormat | undefined;
    readonly supported: readonly ConfigFormat[];
    readonly onError: (path: string, message: string) => void;
  },
): Promise<Discovery> {
  const files: string[] = [];
  const skipped = new Map<ConfigFormat, number>();
  let truncated = false;
  const stack: Array<{ readonly path: string; readonly depth: number }> = [
    { path: root, depth: 0 },
  ];

  while (stack.length > 0 && !truncated) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch (error) {
      options.onError(
        current.path,
        error instanceof Error ? error.message : 'cannot read directory',
      );
      continue;
    }
    entries.sort((a, b) => compareText(a.name, b.name));

    const directories: string[] = [];
    for (const entry of entries) {
      const path = join(current.path, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name) && current.depth < MAX_DEPTH) {
          directories.push(path);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const candidates = candidateFormats(entry.name);
      const wanted =
        options.format === undefined ? candidates : candidates.filter((c) => c === options.format);
      const format = wanted[0];
      if (format === undefined) {
        continue;
      }
      if (!options.supported.includes(format)) {
        skipped.set(format, (skipped.get(format) ?? 0) + 1);
        continue;
      }
      if (files.length >= MAX_FILES) {
        truncated = true;
        break;
      }
      files.push(path);
    }
    // Reverse so the stack pops directories in sorted order.
    for (const directory of directories.reverse()) {
      stack.push({ path: directory, depth: current.depth + 1 });
    }
  }
  return { files: files.sort(compareText), skipped, truncated };
}

export type ReadResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/** Read a file as UTF-8, refusing anything that is not a regular file or is over the size limit. */
export async function readInputFile(path: string): Promise<ReadResult> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return { ok: false, error: 'not a regular file' };
    }
    if (info.size > MAX_INPUT_BYTES) {
      return { ok: false, error: `larger than the ${String(MAX_INPUT_BYTES)}-byte limit` };
    }
    return { ok: true, text: await readFile(path, 'utf8') };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'cannot read file' };
  }
}

/**
 * Directory discovery picks `.json` files by name, but most JSON files are not IAM
 * policies. Keep only those whose content looks like one.
 */
export function isPolicyContent(text: string): boolean {
  return detectFormat(text) === 'iam-policy';
}
