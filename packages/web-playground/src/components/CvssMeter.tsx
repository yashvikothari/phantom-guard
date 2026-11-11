import type { ReactElement } from 'react';
import type { CvssEstimate, Rating } from '../lib/cvss';

interface RatingStyle {
  readonly text: string;
  readonly bar: string;
}

/** Complete literal classes. Red marks the two top bands, as it does for the severity badges. */
const RATING_STYLE: Readonly<Record<Rating, RatingStyle>> = {
  CRITICAL: { text: 'text-neon-red text-glow-red', bar: 'bg-neon-red' },
  HIGH: { text: 'text-neon-red', bar: 'bg-neon-red' },
  MEDIUM: { text: 'text-amber-300', bar: 'bg-amber-300' },
  LOW: { text: 'text-sky-300', bar: 'bg-sky-300' },
  NONE: { text: 'text-slate-400', bar: 'bg-slate-400' },
};

interface CvssMeterProps {
  readonly estimate: CvssEstimate | undefined;
  readonly label?: string;
  /** Show the one-line explanation of what the number is. */
  readonly explain?: boolean;
}

/**
 * An estimated CVSS v3.1 base score: the number, its band as a word, a bar, and the vector.
 * The word and the number carry the meaning, so the bar color is never the only signal.
 */
export function CvssMeter({
  estimate,
  label = 'CVSS v3.1 base score (estimated)',
  explain = false,
}: CvssMeterProps): ReactElement {
  if (estimate === undefined) {
    return (
      <p className="text-sm text-slate-400">
        {label}: not scored. Informational findings carry no CVSS estimate.
      </p>
    );
  }
  const style = RATING_STYLE[estimate.rating];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className={`font-mono text-2xl font-bold ${style.text}`}>
          {estimate.score.toFixed(1)}
          <span className="ml-2 text-sm font-semibold">{estimate.rating}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={estimate.score}
        aria-valuetext={`${estimate.score.toFixed(1)} out of 10, ${estimate.rating}, estimated`}
        className="h-2 overflow-hidden rounded-full border border-white/10 bg-slate-950/80"
      >
        <div
          className={`h-full rounded-full ${style.bar}`}
          style={{ width: `${String(Math.max(estimate.score * 10, 3))}%` }}
        />
      </div>
      <p className="break-all font-mono text-xs text-slate-400">{estimate.vector}</p>
      {explain ? (
        <p className="text-xs leading-5 text-slate-400">
          Estimated by PhantomGuard from the rule and its severity tier, with the CVSS v3.1
          equations. CVSS scores software vulnerabilities, so for a misconfiguration treat the
          number as a rough guide. It is not an NVD rating.
        </p>
      ) : null}
    </div>
  );
}
