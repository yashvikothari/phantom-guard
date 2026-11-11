import type { Severity } from '@phantomguard/core-engine';

export type SeverityShape = 'octagon' | 'triangle' | 'diamond' | 'circle' | 'square';

export interface SeverityStyle {
  /** Always shown as text next to the icon: color is never the only signal. */
  readonly label: string;
  readonly shape: SeverityShape;
  /** Classes for the badge container. Text and background pairs were contrast-checked. */
  readonly badge: string;
  /** Classes for coloring a single word or icon. */
  readonly text: string;
}

/**
 * Complete literal class strings: Tailwind finds classes by scanning source text, so
 * they must never be assembled from fragments such as `text-${color}`.
 *
 * Red marks vulnerability, so CRITICAL and HIGH share it; CRITICAL is a filled badge and
 * HIGH an outlined one, and their icons differ.
 */
export const SEVERITY_STYLE: Readonly<Record<Severity, SeverityStyle>> = {
  CRITICAL: {
    label: 'CRITICAL',
    shape: 'octagon',
    badge: 'border-neon-red bg-neon-red text-slate-950',
    text: 'text-neon-red',
  },
  HIGH: {
    label: 'HIGH',
    shape: 'triangle',
    badge: 'border-neon-red bg-slate-950 text-neon-red',
    text: 'text-neon-red',
  },
  MEDIUM: {
    label: 'MEDIUM',
    shape: 'diamond',
    badge: 'border-amber-300 bg-slate-950 text-amber-300',
    text: 'text-amber-300',
  },
  LOW: {
    label: 'LOW',
    shape: 'circle',
    badge: 'border-sky-300 bg-slate-950 text-sky-300',
    text: 'text-sky-300',
  },
  INFO: {
    label: 'INFO',
    shape: 'square',
    badge: 'border-slate-400 bg-slate-950 text-slate-400',
    text: 'text-slate-400',
  },
};
