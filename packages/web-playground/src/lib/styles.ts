/**
 * Complete literal class strings, shared by the buttons in every mode. Tailwind finds classes by
 * scanning source text, so they are never assembled from fragments.
 *
 * Green means "apply a fix"; neutral slate means "discard, reset or copy" (see product.md).
 */
export const GREEN_BUTTON =
  'focus-ring rounded-md bg-neon-green px-4 py-2 text-sm font-bold text-slate-950 shadow-neon-green transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none';

export const NEUTRAL_BUTTON =
  'focus-ring rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';
