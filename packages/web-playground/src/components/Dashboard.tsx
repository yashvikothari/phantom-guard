import type { ReactElement } from 'react';
import type { Severity } from '@phantomguard/core-engine';
import type { ScanReport } from '@phantomguard/core-engine';
import { highestEstimate } from '../lib/cvss';
import { SEVERITY_STYLE } from '../lib/severity-style';

interface DashboardProps {
  readonly report: ScanReport | undefined;
  readonly exorcisms: number;
}

const ORDER: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

/** Complete literal classes for the bars; the label and count beside each bar carry the meaning. */
const BAR: Readonly<Record<Severity, string>> = {
  CRITICAL: 'bg-neon-red',
  HIGH: 'bg-neon-red/60',
  MEDIUM: 'bg-amber-300',
  LOW: 'bg-sky-300',
  INFO: 'bg-slate-400',
};

function Tile({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: string;
}): ReactElement {
  return (
    <div className="glass-panel rounded-xl p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-bold ${tone}`}>{value}</dd>
    </div>
  );
}

/** The account at a glance: how many resources are haunted, by how much, and how bad. */
export function Dashboard({ report, exorcisms }: DashboardProps): ReactElement {
  if (report === undefined) {
    return (
      <p className="text-sm text-slate-400" role="status">
        Scanning the account…
      </p>
    );
  }

  const haunted = new Set(report.findings.map((finding) => finding.resourceId)).size;
  const total = report.resources.length;
  const worst = highestEstimate(report.findings);
  const peak = Math.max(1, ...ORDER.map((severity) => report.summary.bySeverity[severity]));

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Zombie resources"
          value={`${String(haunted)} / ${String(total)}`}
          tone={haunted > 0 ? 'text-neon-red' : 'text-neon-green'}
        />
        <Tile
          label="Poltergeists"
          value={String(report.summary.total)}
          tone={report.summary.total > 0 ? 'text-neon-red' : 'text-neon-green'}
        />
        <Tile
          label="Worst CVSS (est.)"
          value={worst === undefined ? 'none' : `${worst.score.toFixed(1)} ${worst.rating}`}
          tone={worst === undefined ? 'text-neon-green' : 'text-neon-red'}
        />
        <Tile label="Exorcisms done" value={String(exorcisms)} tone="text-neon-green" />
      </dl>

      <ul aria-label="Poltergeists by severity" className="space-y-1.5">
        {ORDER.map((severity) => {
          const count = report.summary.bySeverity[severity];
          return (
            <li key={severity} className="flex items-center gap-3 text-xs">
              <span className={`w-16 shrink-0 font-semibold ${SEVERITY_STYLE[severity].text}`}>
                {SEVERITY_STYLE[severity].label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-950/70">
                <span
                  className={`block h-full rounded-full ${BAR[severity]}`}
                  style={{
                    width: `${String(count === 0 ? 0 : Math.max(4, (count / peak) * 100))}%`,
                  }}
                />
              </span>
              <span className="w-6 shrink-0 text-right font-mono text-slate-200">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
