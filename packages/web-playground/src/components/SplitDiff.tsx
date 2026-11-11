import type { ReactElement } from 'react';
import { alignLines } from '../lib/line-diff';
import type { DiffCell } from '../lib/line-diff';

interface SplitDiffProps {
  /** The vulnerable configuration. */
  readonly before: string;
  /** The hardened configuration. */
  readonly after: string;
}

type Side = 'before' | 'after';

const ROW: Readonly<Record<Side, string>> = {
  before: 'border-neon-red bg-neon-red/10',
  after: 'border-neon-green bg-neon-green/10',
};

const SIGIL: Readonly<Record<Side, string>> = {
  before: 'text-neon-red',
  after: 'text-neon-green',
};

/**
 * Changed rows are tinted at 10% so slate-200 text keeps its contrast; the color lives in the
 * left border and the - or + sign, never in the text (see the contrast table in product.md).
 */
function Cell({
  cell,
  side,
}: {
  readonly cell: DiffCell | undefined;
  readonly side: Side;
}): ReactElement {
  if (cell === undefined) {
    return <span className="block h-5 border-l-2 border-transparent" aria-hidden="true" />;
  }
  return (
    <span
      className={`flex h-5 whitespace-pre border-l-2 px-2 text-slate-200 ${
        cell.changed ? ROW[side] : 'border-transparent'
      }`}
    >
      <span className="mr-2 inline-block w-6 shrink-0 select-none text-right text-slate-400">
        {cell.number}
      </span>
      {cell.changed ? (
        <>
          <span className={`mr-1 select-none font-bold ${SIGIL[side]}`} aria-hidden="true">
            {side === 'before' ? '-' : '+'}
          </span>
          <span className="sr-only">{side === 'before' ? 'removed: ' : 'added: '}</span>
        </>
      ) : (
        <span className="mr-1 select-none" aria-hidden="true">
          {' '}
        </span>
      )}
      {cell.text === '' ? ' ' : cell.text}
    </span>
  );
}

function Column({
  side,
  title,
  rows,
}: {
  readonly side: Side;
  readonly title: string;
  readonly rows: ReadonlyArray<DiffCell | undefined>;
}): ReactElement {
  const accent = side === 'before' ? 'text-neon-red' : 'text-neon-green';
  return (
    <section aria-label={title} className="min-w-0">
      <h6 className={`flex items-center gap-2 px-2 pb-1 text-xs font-semibold uppercase ${accent}`}>
        <span aria-hidden="true">{side === 'before' ? '✕' : '✓'}</span>
        {title}
      </h6>
      <pre className="overflow-x-auto rounded-md border border-white/10 bg-slate-950/80 py-2 font-mono text-xs leading-5">
        <code className="block w-max min-w-full">
          {rows.map((cell, index) => (
            // Rows are positional and never reordered, so the index is a stable key.
            <Cell key={index} cell={cell} side={side} />
          ))}
        </code>
      </pre>
    </section>
  );
}

/**
 * The vulnerable configuration on the left and the hardened one on the right, aligned line by
 * line. Below 768 px the two stack. Text only: nothing here is rendered as HTML.
 */
export function SplitDiff({ before, after }: SplitDiffProps): ReactElement {
  const rows = alignLines(before, after);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Column side="before" title="Vulnerable" rows={rows.map((row) => row.left)} />
      <Column side="after" title="Hardened" rows={rows.map((row) => row.right)} />
    </div>
  );
}
