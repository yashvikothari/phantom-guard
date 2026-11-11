import type { ReactElement } from 'react';
import type { Severity } from '@phantomguard/core-engine';
import { SEVERITY_STYLE } from '../lib/severity-style';
import type { SeverityShape } from '../lib/severity-style';

const SHAPES: Readonly<Record<SeverityShape, ReactElement>> = {
  octagon: <path d="M4 1h4l3 3v4l-3 3H4L1 8V4z" />,
  triangle: <path d="M6 1l5.5 10h-11z" />,
  diamond: <path d="M6 1l5 5-5 5-5-5z" />,
  circle: <circle cx="6" cy="6" r="5" />,
  square: <rect x="1.5" y="1.5" width="9" height="9" />,
};

interface SeverityBadgeProps {
  readonly severity: Severity;
}

/** Severity as an icon plus a text label plus color, so color is never the only signal. */
export function SeverityBadge({ severity }: SeverityBadgeProps): ReactElement {
  const style = SEVERITY_STYLE[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold tracking-wide ${style.badge}`}
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="currentColor" aria-hidden="true">
        {SHAPES[style.shape]}
      </svg>
      {style.label}
    </span>
  );
}
