import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ConfigFormat, Finding } from '@phantomguard/core-engine';
import { estimateFor } from '../lib/cvss';
import { wardFor } from '../lib/lexicon';
import { riskExplanation } from '../lib/risk-copy';
import { CopyButton } from './CopyButton';
import { CvssMeter } from './CvssMeter';
import { SeverityBadge } from './SeverityBadge';
import { SplitDiff } from './SplitDiff';

interface FindingCardProps {
  readonly finding: Finding;
  /** Source lines around the finding (Mode 2). */
  readonly excerpt?: ReactNode;
  /** Buttons that act on the fix, such as Perform exorcism (Mode 1). */
  readonly actions?: ReactNode;
  /** The format the finding came from; Terraform fixes are shown in normalized form. */
  readonly sourceFormat?: ConfigFormat | undefined;
}

/**
 * One poltergeist: severity, rule, the problem in plain words, why it matters, an estimated
 * CVSS score, compliance references, and the exorcism as a before and after.
 */
export function FindingCard({
  finding,
  excerpt,
  actions,
  sourceFormat,
}: FindingCardProps): ReactElement {
  const headingId = useId();
  const ward = wardFor(finding.ruleId);
  const estimate = estimateFor(finding);
  const { patch } = finding;

  return (
    <article aria-labelledby={headingId} className="glass-panel rounded-xl p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SeverityBadge severity={finding.severity} />
        <h4 id={headingId} className="font-mono text-sm font-semibold text-slate-200">
          {finding.ruleId}
        </h4>
        {ward === undefined ? null : <span className="text-sm italic text-slate-400">{ward}</span>}
        {estimate === undefined ? null : (
          <span className="ml-auto font-mono text-xs text-slate-300">
            CVSS ~{estimate.score.toFixed(1)} {estimate.rating}
          </span>
        )}
      </header>

      <p className="mt-3 text-sm leading-6 text-slate-200">{finding.message}</p>
      <p className="mt-1 break-words font-mono text-xs text-slate-400">
        {finding.resourceName}
        {finding.line === undefined ? '' : ` · line ${String(finding.line)}`}
      </p>

      {excerpt}

      <section aria-label="Why this is risky" className="mt-4 space-y-3">
        <p className="text-sm leading-6 text-slate-300">
          <strong className="text-slate-100">Why it matters. </strong>
          {riskExplanation(finding.ruleId)}
        </p>
        <CvssMeter estimate={estimate} />
      </section>

      <ul className="mt-4 space-y-1" aria-label="Compliance references">
        {finding.references.map((reference) => (
          <li
            key={`${reference.benchmark}|${reference.version}|${reference.control}`}
            className="text-xs text-slate-400"
          >
            <span className="font-mono">
              {reference.benchmark} {reference.version} · {reference.control}
            </span>
            <span className="block sm:inline sm:before:content-['_–_']">{reference.title}</span>
          </li>
        ))}
      </ul>

      {patch === undefined ? (
        <section
          aria-label="Manual rites"
          className="mt-4 rounded-md border border-white/10 bg-slate-950/50 p-3"
        >
          <h5 className="text-sm font-semibold text-amber-300">Manual rites required</h5>
          <p className="mt-1 text-sm leading-6 text-slate-200">
            {finding.guidance ?? 'No automatic fix is available. Fix this by hand.'}
          </p>
        </section>
      ) : (
        <section aria-label="Exorcism" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-sm font-semibold text-neon-green">{patch.title}</h5>
            {patch.reviewRequired ? (
              <span className="rounded border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-300">
                Review required
              </span>
            ) : (
              <span className="rounded border border-neon-green px-2 py-0.5 text-xs font-semibold text-neon-green">
                Safe to apply
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-slate-200">{patch.rationale}</p>
          <SplitDiff before={patch.preview.before} after={patch.preview.after} />
          {sourceFormat === 'terraform' ? (
            <p className="text-xs leading-5 text-slate-400">
              Shown in PhantomGuard&apos;s normalized form: a name such as cidrBlocks stands for
              cidr_blocks in your HCL. Make the same change in your Terraform.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <CopyButton text={patch.preview.after} label="Copy hardened version" />
            <CopyButton text={patch.preview.unifiedDiff} label="Copy diff" />
          </div>
        </section>
      )}
    </article>
  );
}
