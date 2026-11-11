import type { ReactElement } from 'react';

interface SourceExcerptProps {
  /** The exact text that was scanned. */
  readonly source: string;
  /** 1-based line of the finding. */
  readonly line: number;
  /** Lines of context on each side. */
  readonly context?: number;
}

/** The lines around a finding, with line numbers and the offending line marked. Text only. */
export function SourceExcerpt({
  source,
  line,
  context = 2,
}: SourceExcerptProps): ReactElement | null {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) {
    return null;
  }
  const first = Math.max(1, line - context);
  const last = Math.min(lines.length, line + context);
  const shown = lines.slice(first - 1, last);

  return (
    <pre
      aria-label={`Source lines ${String(first)} to ${String(last)}`}
      className="mt-3 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 py-2 font-mono text-xs leading-5"
    >
      <code>
        {shown.map((text, offset) => {
          const number = first + offset;
          const offending = number === line;
          return (
            <span
              key={number}
              className={`block whitespace-pre border-l-2 px-3 text-slate-200 ${
                offending ? 'border-neon-red bg-neon-red/10' : 'border-transparent'
              }`}
            >
              <span className="mr-3 inline-block w-8 select-none text-right text-slate-400">
                {number}
              </span>
              {offending ? <span className="sr-only">offending line: </span> : null}
              {text === '' ? ' ' : text}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
