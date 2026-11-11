export interface DiffCell {
  /** 1-based line number within its own side. */
  readonly number: number;
  readonly text: string;
  readonly changed: boolean;
}

/** One row of a side-by-side diff. A side is undefined where the other side has an extra line. */
export interface DiffRow {
  readonly left: DiffCell | undefined;
  readonly right: DiffCell | undefined;
}

type Op = { readonly tag: 'same' | 'remove' | 'add'; readonly text: string };

/** Above this many table cells the quadratic alignment is skipped and the two texts are shown as replaced. */
const MAX_CELLS = 250_000;

function lines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

function operations(before: readonly string[], after: readonly string[]): Op[] {
  const rows = before.length;
  const cols = after.length;
  if ((rows + 1) * (cols + 1) > MAX_CELLS) {
    return [
      ...before.map((text): Op => ({ tag: 'remove', text })),
      ...after.map((text): Op => ({ tag: 'add', text })),
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

  const ops: Op[] = [];
  let row = 0;
  let col = 0;
  while (row < rows && col < cols) {
    const left = before[row] ?? '';
    const right = after[col] ?? '';
    if (left === right) {
      ops.push({ tag: 'same', text: left });
      row += 1;
      col += 1;
    } else if (cell(row + 1, col) >= cell(row, col + 1)) {
      ops.push({ tag: 'remove', text: left });
      row += 1;
    } else {
      ops.push({ tag: 'add', text: right });
      col += 1;
    }
  }
  for (; row < rows; row += 1) {
    ops.push({ tag: 'remove', text: before[row] ?? '' });
  }
  for (; col < cols; col += 1) {
    ops.push({ tag: 'add', text: after[col] ?? '' });
  }
  return ops;
}

/**
 * Align two texts line by line for a side-by-side view. Unchanged lines share a row; a run of
 * removed and added lines is paired off so a replaced line sits across from its replacement.
 */
export function alignLines(before: string, after: string): DiffRow[] {
  const ops = operations(lines(before), lines(after));
  const rows: DiffRow[] = [];
  let leftNumber = 0;
  let rightNumber = 0;
  let removed: string[] = [];
  let added: string[] = [];

  const flush = (): void => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index += 1) {
      const gone = removed[index];
      const came = added[index];
      if (gone !== undefined) {
        leftNumber += 1;
      }
      if (came !== undefined) {
        rightNumber += 1;
      }
      rows.push({
        left: gone === undefined ? undefined : { number: leftNumber, text: gone, changed: true },
        right: came === undefined ? undefined : { number: rightNumber, text: came, changed: true },
      });
    }
    removed = [];
    added = [];
  };

  for (const op of ops) {
    if (op.tag === 'remove') {
      removed.push(op.text);
    } else if (op.tag === 'add') {
      added.push(op.text);
    } else {
      flush();
      leftNumber += 1;
      rightNumber += 1;
      rows.push({
        left: { number: leftNumber, text: op.text, changed: false },
        right: { number: rightNumber, text: op.text, changed: false },
      });
    }
  }
  flush();
  return rows;
}
