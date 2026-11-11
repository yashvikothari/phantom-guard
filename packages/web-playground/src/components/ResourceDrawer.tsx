import { useEffect, useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Finding, HauntedResource } from '@phantomguard/core-engine';
import { highestEstimate } from '../lib/cvss';
import { KIND_LABEL, ghostName, poltergeists } from '../lib/lexicon';
import { NEUTRAL_BUTTON } from '../lib/styles';
import { CvssMeter } from './CvssMeter';
import { FindingCard } from './FindingCard';

interface ResourceDrawerProps {
  /** The resource to show, or undefined while the drawer is closed. */
  readonly resource: HauntedResource | undefined;
  readonly findings: readonly Finding[];
  readonly onClose: () => void;
  /** The exorcism buttons for one finding. */
  readonly actionsFor: (finding: Finding) => ReactNode;
}

/**
 * A right-hand drawer built on the native modal dialog, which supplies the focus trap, the Esc
 * key, inert background and focus return for free. It shows the resource's highest estimated
 * CVSS score, then each poltergeist with its explanation and its exorcism.
 */
export function ResourceDrawer({
  resource,
  findings,
  onClose,
  actionsFor,
}: ResourceDrawerProps): ReactElement {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const headingId = useId();
  const open = resource !== undefined;

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself, not on its content.
        if (event.target === event.currentTarget) {
          dialog.current?.close();
        }
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl overflow-hidden border-l border-white/10 bg-slate-900/85 p-0 text-slate-200 backdrop-blur-xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm open:motion-safe:animate-slide-in"
    >
      {resource === undefined ? null : (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
            <div className="min-w-0">
              <h2 id={headingId} className="font-display text-2xl text-slate-100">
                {ghostName(resource)}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {KIND_LABEL[resource.kind]} ·{' '}
                <span className="break-all font-mono">{resource.id}</span>
              </p>
              <p
                className={`mt-2 text-sm font-semibold ${
                  findings.length > 0 ? 'text-neon-red' : 'text-neon-green'
                }`}
              >
                {findings.length > 0
                  ? `Zombie resource · ${poltergeists(findings.length)}`
                  : 'Sanctified · nothing haunts this resource'}
              </p>
            </div>
            <button
              type="button"
              className={NEUTRAL_BUTTON}
              onClick={() => {
                dialog.current?.close();
              }}
            >
              Close
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {findings.length > 0 ? (
              <section aria-label="Resource severity" className="glass-panel rounded-xl p-4">
                <CvssMeter
                  estimate={highestEstimate(findings)}
                  label="Highest CVSS v3.1 base score (estimated)"
                  explain
                />
              </section>
            ) : (
              <p className="glass-panel rounded-xl border-neon-green p-4 text-sm text-slate-200">
                <strong className="text-neon-green">Sanctified. </strong>
                No rule finds anything wrong with this resource.
              </p>
            )}

            <ul className="space-y-4" aria-label="Poltergeists on this resource">
              {findings.map((finding) => (
                <li key={`${finding.ruleId}:${finding.locationKey}`}>
                  <FindingCard finding={finding} actions={actionsFor(finding)} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </dialog>
  );
}
