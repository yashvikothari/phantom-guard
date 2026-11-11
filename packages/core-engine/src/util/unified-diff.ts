type Tag = ' ' | '-' | '+';

interface Edit {
  readonly tag: Tag;
  readonly text: string;
}

/** Above this many cells the quadratic LCS table is skipped for a coarse diff. */
const MAX_TABLE_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

function diffLines(before: readonly string[], after: readonly string[]): Edit[] {
  const rows = before.length;
  const cols = after.length;

  if ((rows + 1) * (cols + 1) > MAX_TABLE_CELLS) {
    return [
      ...before.map((text): Edit => ({ tag: '-', text })),
      ...after.map((text): Edit => ({ tag: '+', text })),
    ];
  }

  const width = cols + 1;
  const table = new Uint32Array((rows + 1) * width);
  const cell = (row: number, col: number): number => table[row * width + col] ?? 0;

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      table[row * width + col] =
        before[row] === after[col]
          ? cell(row + 1, col + 1) + 1
          : Math.max(cell(row + 1, col), cell(row, col + 1));
    }
  }

  const edits: Edit[] = [];
  let row = 0;
  let col = 0;
  while (row < rows && col < cols) {
    const left = before[row] ?? '';
    const right = after[col] ?? '';
    if (left === right) {
      edits.push({ tag: ' ', text: left });
      row += 1;
      col += 1;
    } else if (cell(row + 1, col) >= cell(row, col + 1)) {
      edits.push({ tag: '-', text: left });
      row += 1;
    } else {
      edits.push({ tag: '+', text: right });
      col += 1;
    }
  }
  while (row < rows) {
    edits.push({ tag: '-', text: before[row] ?? '' });
    row += 1;
  }
  while (col < cols) {
    edits.push({ tag: '+', text: after[col] ?? '' });
    col += 1;
  }
  return edits;
}

export interface UnifiedDiffOptions {
  readonly beforeLabel?: string;
  readonly afterLabel?: string;
  /** Lines of unchanged context around each change. Default 3. */
  readonly context?: number;
}

/**
 * Unified diff of two texts. Returns an empty string when the texts are equal.
 * Deterministic: equal input always yields byte-identical output.
 */
export function unifiedDiff(
  before: string,
  after: string,
  options: UnifiedDiffOptions = {},
): string {
  const context = options.context ?? 3;
  const edits = diffLines(splitLines(before), splitLines(after));

  const changed: number[] = [];
  edits.forEach((edit, index) => {
    if (edit.tag !== ' ') {
      changed.push(index);
    }
  });
  if (changed.length === 0) {
    return '';
  }

  // Group changes whose context windows touch into one hunk each.
  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(edits.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last !== undefined && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  // consumedBefore[i] / consumedAfter[i]: lines of each side used by edits[0..i-1].
  const consumedBefore: number[] = [0];
  const consumedAfter: number[] = [0];
  for (const edit of edits) {
    consumedBefore.push(
      (consumedBefore[consumedBefore.length - 1] ?? 0) + (edit.tag === '+' ? 0 : 1),
    );
    consumedAfter.push((consumedAfter[consumedAfter.length - 1] ?? 0) + (edit.tag === '-' ? 0 : 1));
  }

  const lines = [`--- ${options.beforeLabel ?? 'before'}`, `+++ ${options.afterLabel ?? 'after'}`];
  for (const [start, end] of ranges) {
    const slice = edits.slice(start, end + 1);
    const beforeCount = slice.filter((edit) => edit.tag !== '+').length;
    const afterCount = slice.filter((edit) => edit.tag !== '-').length;
    const beforeStart = (consumedBefore[start] ?? 0) + (beforeCount === 0 ? 0 : 1);
    const afterStart = (consumedAfter[start] ?? 0) + (afterCount === 0 ? 0 : 1);
    lines.push(
      `@@ -${String(beforeStart)},${String(beforeCount)} +${String(afterStart)},${String(afterCount)} @@`,
    );
    for (const edit of slice) {
      lines.push(`${edit.tag}${edit.text}`);
    }
  }
  return lines.join('\n');
}
