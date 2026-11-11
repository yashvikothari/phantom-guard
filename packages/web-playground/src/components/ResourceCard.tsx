import type { ReactElement } from 'react';
import type { Finding, HauntedResource } from '@phantomguard/core-engine';
import { highestEstimate } from '../lib/cvss';
import { KIND_LABEL, ghostName, poltergeists } from '../lib/lexicon';
import { SeverityBadge } from './SeverityBadge';

interface ResourceCardProps {
  readonly resource: HauntedResource;
  /** Findings for this resource, most severe first. `undefined` while the first scan runs. */
  readonly findings: readonly Finding[] | undefined;
  /** Opens the resource drawer. */
  readonly onOpen: () => void;
}

/**
 * One resource in the haunted account. A zombie resource (one with findings) glows red and a
 * sanctified one glows green. The state is also written in words and an icon, never color alone.
 */
export function ResourceCard({ resource, findings, onOpen }: ResourceCardProps): ReactElement {
  const scanned = findings !== undefined;
  const haunted = scanned && findings.length > 0;
  const top = findings?.[0];
  const estimate = findings === undefined ? undefined : highestEstimate(findings);

  const frame = !scanned
    ? 'border-white/10'
    : haunted
      ? 'border-neon-red shadow-neon-red'
      : 'border-neon-green shadow-neon-green';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`focus-ring glass-panel w-full rounded-xl border p-4 text-left transition-shadow hover:bg-slate-800/70 ${frame}`}
    >
      <span className="block font-display text-lg text-slate-100">{ghostName(resource)}</span>
      <span className="mt-0.5 block text-xs text-slate-400">{KIND_LABEL[resource.kind]}</span>
      <span className="mt-1 block break-all font-mono text-xs text-slate-400">{resource.name}</span>

      <span className="mt-3 flex flex-wrap items-center gap-2">
        {!scanned ? (
          <span className="text-sm text-slate-400">Scanning…</span>
        ) : haunted && top !== undefined ? (
          <>
            <SeverityBadge severity={top.severity} />
            <span className="text-sm text-neon-red">
              Zombie resource · {poltergeists(findings.length)}
            </span>
            {estimate === undefined ? null : (
              <span className="font-mono text-xs text-slate-300">
                CVSS ~{estimate.score.toFixed(1)}
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neon-green text-glow-green">
            <svg
              viewBox="0 0 12 12"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M2 6.5l2.5 2.5L10 3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sanctified
          </span>
        )}
      </span>
    </button>
  );
}
