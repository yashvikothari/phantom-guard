import type { ReactElement } from 'react';
import { hauntingVerdict } from '../lib/lexicon';

interface HauntingMeterProps {
  /** The engine's Risk_Score, 0 to 100. */
  readonly score: number;
  readonly label?: string;
}

/**
 * The Haunting level: neon red above 0, neon green at 0 (Requirement 17.8). The number and
 * the verdict word are always shown, so the bar color is never the only signal.
 */
export function HauntingMeter({
  score,
  label = 'Haunting level',
}: HauntingMeterProps): ReactElement {
  const clean = score === 0;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span
          className={`font-mono text-sm ${clean ? 'text-neon-green text-glow-green' : 'text-neon-red text-glow-red'}`}
        >
          {clamped} / 100 · {hauntingVerdict(score)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${String(clamped)} out of 100, ${hauntingVerdict(score)}`}
        className="h-3 overflow-hidden rounded-full border border-slate-800 bg-slate-950"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            clean
              ? 'bg-neon-green shadow-neon-green'
              : 'bg-neon-red shadow-neon-red motion-safe:animate-breathe'
          }`}
          style={{ width: clean ? '100%' : `${String(Math.max(clamped, 4))}%` }}
        />
      </div>
    </div>
  );
}
